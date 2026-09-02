// commands/search.js - Recherche via DuckDuckGo, Wikipedia et Web Search
const { formatMessage, keyValue } = require('../lib/messageStyler');
const config = require('../config');

let axiosClient = null;
let cheerioModule = null;
let duckDuckScrape = null;

function getAxios() {
    if (!axiosClient) {
        axiosClient = require('axios');
    }
    return axiosClient;
}

function getCheerio() {
    if (!cheerioModule) {
        cheerioModule = require('cheerio');
    }
    return cheerioModule;
}

function getDuckDuckScrape() {
    if (!duckDuckScrape) {
        duckDuckScrape = require('duck-duck-scrape');
    }
    return duckDuckScrape;
}

// Cache simple
const searchCache = new Map();
const imageSearchCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const MAX_RESULTS = 5;
const MAX_IMAGE_RESULTS = 3;

function stripHtml(value = '') {
    return String(value || '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function searchDuckDuckGo(query) {
    const htmlResults = await searchDuckDuckGoHtml(query);
    if (htmlResults.length > 0) return htmlResults;

    const instantResults = await searchDuckDuckGoInstant(query);
    if (instantResults.length > 0) return instantResults;

    return searchDuckDuckGoLibrary(query);
}

async function searchDuckDuckGoImages(query) {
    const cacheKey = `images:${query.toLowerCase()}`;
    const cached = imageSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`[SEARCH] Image cache hit for: "${query}"`);
        return cached.data;
    }

    const DDG = getDuckDuckScrape();
    if (typeof DDG.searchImages !== 'function') return [];

    try {
        const response = await DDG.searchImages(
            query,
            {
                safeSearch: DDG.SafeSearchType.MODERATE,
                locale: 'fr-fr',
                region: 'fr-fr',
                marketRegion: 'fr-FR'
            },
            {
                open_timeout: 5000,
                read_timeout: 8000
            }
        );

        if (response.noResults || !Array.isArray(response.results)) return [];

        const images = response.results
            .filter(item => item?.image || item?.thumbnail)
            .slice(0, MAX_IMAGE_RESULTS)
            .map(item => ({
                title: stripHtml(item.title || query),
                image: item.image || item.thumbnail,
                thumbnail: item.thumbnail || item.image,
                url: item.url || item.image || item.thumbnail,
                source: item.source || '',
                width: item.width || 0,
                height: item.height || 0
            }));

        if (images.length > 0) {
            imageSearchCache.set(cacheKey, {
                data: images,
                timestamp: Date.now()
            });
        }

        return images;
    } catch (err) {
        console.log(`[SEARCH] DuckDuckGo Images error: ${err.message}`);
        return [];
    }
}

async function downloadImageBuffer(url) {
    const response = await getAxios().get(url, {
        responseType: 'arraybuffer',
        timeout: 12000,
        maxContentLength: 5 * 1024 * 1024,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
    });

    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
        throw new Error(`Type image invalide: ${contentType || 'inconnu'}`);
    }

    return Buffer.from(response.data);
}

function formatImageResults(images = []) {
    if (!images.length) return '';

    let text = '*🖼️ Images trouvées*\n';
    images.forEach((image, index) => {
        text += `${index + 1}. ${image.title || 'Image'}\n`;
        if (image.width && image.height) text += `   Taille: ${image.width}x${image.height}\n`;
        if (image.url) text += `   Source: ${image.url}\n`;
        if (image.image) text += `   Image: ${image.image}\n`;
    });
    return text.trim();
}

async function searchDuckDuckGoLibrary(query) {
    try {
        const DDG = getDuckDuckScrape();
        const response = await DDG.search(
            query,
            {
                safeSearch: DDG.SafeSearchType.MODERATE,
                locale: 'fr-fr',
                region: 'fr-fr',
                marketRegion: 'fr-FR'
            },
            {
                open_timeout: 5000,
                read_timeout: 7000
            }
        );

        if (response.noResults || !Array.isArray(response.results)) {
            return [];
        }

        return response.results
            .filter(item => item?.title && item?.url)
            .slice(0, MAX_RESULTS)
            .map(item => ({
                title: stripHtml(item.title),
                url: item.url,
                description: stripHtml(item.description),
                source: 'DuckDuckGo'
            }));
    } catch (err) {
        console.log(`[SEARCH] DuckDuckGo error: ${err.message}`);
        return [];
    }
}

async function searchDuckDuckGoHtml(query) {
    try {
        const response = await getAxios().get('https://html.duckduckgo.com/html/', {
            params: { q: query },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
            },
            timeout: 8000
        });

        const $ = getCheerio().load(response.data);
        const results = [];

        $('.result').each((_, element) => {
            if (results.length >= MAX_RESULTS) return false;

            const title = stripHtml($(element).find('.result__a').first().text());
            const rawUrl = $(element).find('.result__a').first().attr('href') || '';
            const description = stripHtml($(element).find('.result__snippet').first().text());
            const url = normalizeDuckDuckGoUrl(rawUrl);

            if (!title || !url) return;

            results.push({
                title,
                url,
                description,
                source: 'DuckDuckGo'
            });
        });

        return results;
    } catch (err) {
        console.log(`[SEARCH] DuckDuckGo HTML error: ${err.message}`);
        return [];
    }
}

function normalizeDuckDuckGoUrl(rawUrl = '') {
    const value = String(rawUrl || '').trim();
    if (!value) return '';

    try {
        const parsed = new URL(value, 'https://duckduckgo.com');
        const encodedTarget = parsed.searchParams.get('uddg');
        if (encodedTarget) return decodeURIComponent(encodedTarget);
        return parsed.href;
    } catch {
        return value;
    }
}

async function searchDuckDuckGoInstant(query) {
    try {
        const response = await getAxios().get('https://api.duckduckgo.com/', {
            params: {
                q: query,
                format: 'json',
                no_html: 1,
                skip_disambig: 1
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
            },
            timeout: 8000
        });

        const data = response.data || {};
        const results = [];

        if (data.AbstractURL && (data.AbstractText || data.Heading)) {
            results.push({
                title: stripHtml(data.Heading || query),
                url: data.AbstractURL,
                description: stripHtml(data.AbstractText || data.AbstractSource || ''),
                source: 'DuckDuckGo'
            });
        }

        const topics = flattenDuckDuckGoTopics(data.RelatedTopics);
        for (const topic of topics) {
            if (results.length >= MAX_RESULTS) break;
            if (!topic.FirstURL || !topic.Text) continue;

            const title = stripHtml(topic.Text.split(' - ')[0] || topic.Text);
            const description = stripHtml(topic.Text);
            if (results.some(item => item.url === topic.FirstURL)) continue;

            results.push({
                title,
                url: topic.FirstURL,
                description,
                source: 'DuckDuckGo'
            });
        }

        return results.slice(0, MAX_RESULTS);
    } catch (err) {
        console.log(`[SEARCH] DuckDuckGo Instant error: ${err.message}`);
        return [];
    }
}

function flattenDuckDuckGoTopics(topics = []) {
    if (!Array.isArray(topics)) return [];

    const flattened = [];
    for (const topic of topics) {
        if (Array.isArray(topic?.Topics)) {
            flattened.push(...flattenDuckDuckGoTopics(topic.Topics));
        } else {
            flattened.push(topic);
        }
    }

    return flattened;
}

// Base de données complète de résultats populaires
const SEARCH_DATABASE = {
    'javascript': [
        { title: 'JavaScript - MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', description: 'Learn JavaScript programming with comprehensive documentation and examples' },
        { title: 'JavaScript.com Official', url: 'https://www.javascript.com/', description: 'The official JavaScript resource for developers worldwide' },
        { title: 'W3Schools JS Tutorial', url: 'https://www.w3schools.com/js/', description: 'Interactive JavaScript tutorials and references' },
        { title: 'JavaScript Info', url: 'https://javascript.info/', description: 'Modern JavaScript tutorial from basics to advanced topics' },
        { title: 'Eloquent JavaScript', url: 'https://eloquentjavascript.net/', description: 'Free online book about JavaScript programming' }
    ],
    'python': [
        { title: 'Python.org Official', url: 'https://www.python.org/', description: 'Official Python programming language website' },
        { title: 'Python Documentation', url: 'https://docs.python.org/', description: 'Complete Python library and language reference' },
        { title: 'Learn Python', url: 'https://www.learnpython.org/', description: 'Interactive Python programming tutorial' },
        { title: 'Real Python', url: 'https://realpython.com/', description: 'Python tutorials, articles and coding resources' },
        { title: 'Automate the Boring Stuff', url: 'https://automatetheboringstuff.com/', description: 'Free Python programming book' }
    ],
    'nodejs': [
        { title: 'Node.js Official', url: 'https://nodejs.org/', description: 'JavaScript runtime built on Chrome\'s V8 engine' },
        { title: 'Node.js Documentation', url: 'https://nodejs.org/en/docs/', description: 'Complete Node.js API documentation' },
        { title: 'Node.js Tutorial', url: 'https://www.w3schools.com/nodejs/', description: 'Learn Node.js development step by step' },
        { title: 'Express.js Framework', url: 'https://expressjs.com/', description: 'Fast, unopinionated web framework for Node.js' },
        { title: 'Node Package Manager NPM', url: 'https://www.npmjs.com/', description: 'JavaScript package management registry' }
    ],
    'web development': [
        { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/', description: 'Mozilla\'s comprehensive web development resource' },
        { title: 'HTML5 Tutorial', url: 'https://www.w3schools.com/html/', description: 'Learn HTML5 markup and semantic elements' },
        { title: 'CSS Complete Guide', url: 'https://www.w3schools.com/css/', description: 'CSS styling, layouts and responsive design' },
        { title: 'Frontend Roadmap', url: 'https://roadmap.sh/frontend', description: 'Complete frontend development learning path' },
        { title: 'Can I Use', url: 'https://caniuse.com/', description: 'Browser compatibility for web technologies' }
    ],
    'machine learning': [
        { title: 'Machine Learning by Google', url: 'https://developers.google.com/machine-learning', description: 'Free Machine Learning crash course by Google' },
        { title: 'TensorFlow', url: 'https://www.tensorflow.org/', description: 'Open source machine learning framework' },
        { title: 'PyTorch', url: 'https://pytorch.org/', description: 'Machine learning framework with GPU support' },
        { title: 'Scikit-learn', url: 'https://scikit-learn.org/', description: 'Python library for machine learning algorithms' },
        { title: 'Kaggle Competitions', url: 'https://www.kaggle.com/', description: 'Data science and machine learning competitions' }
    ],
    'intelligence artificielle': [
        { title: 'Machine Learning by Google', url: 'https://developers.google.com/machine-learning', description: 'Cours gratuit sur l\'apprentissage automatique par Google' },
        { title: 'TensorFlow', url: 'https://www.tensorflow.org/', description: 'Framework d\'IA et apprentissage machine open source' },
        { title: 'OpenAI GPT', url: 'https://openai.com/', description: 'Plateformes et modèles d\'IA avancée' },
        { title: 'DeepMind par Google', url: 'https://www.deepmind.com/', description: 'Recherche en IA et apprentissage automatique' },
        { title: 'Hugging Face', url: 'https://huggingface.co/', description: 'Modèles et outils d\'IA préentraînés' }
    ],
    'ia': [
        { title: 'Machine Learning by Google', url: 'https://developers.google.com/machine-learning', description: 'Free Machine Learning crash course by Google' },
        { title: 'TensorFlow', url: 'https://www.tensorflow.org/', description: 'Open source machine learning framework' },
        { title: 'OpenAI', url: 'https://openai.com/', description: 'Advanced AI models and platforms' },
        { title: 'DeepMind', url: 'https://www.deepmind.com/', description: 'AI and machine learning research' },
        { title: 'Hugging Face', url: 'https://huggingface.co/', description: 'Pretrained AI models and tools' }
    ],
    'artificial intelligence': [
        { title: 'Machine Learning by Google', url: 'https://developers.google.com/machine-learning', description: 'Free Machine Learning crash course by Google' },
        { title: 'TensorFlow', url: 'https://www.tensorflow.org/', description: 'Open source machine learning framework' },
        { title: 'OpenAI', url: 'https://openai.com/', description: 'Advanced AI models and platforms' },
        { title: 'DeepMind', url: 'https://www.deepmind.com/', description: 'AI and machine learning research' },
        { title: 'Hugging Face', url: 'https://huggingface.co/', description: 'Pretrained AI models and tools' }
    ],
    'ai': [
        { title: 'Machine Learning by Google', url: 'https://developers.google.com/machine-learning', description: 'Free Machine Learning crash course by Google' },
        { title: 'TensorFlow', url: 'https://www.tensorflow.org/', description: 'Open source machine learning framework' },
        { title: 'OpenAI', url: 'https://openai.com/', description: 'Advanced AI models and platforms' },
        { title: 'DeepMind', url: 'https://www.deepmind.com/', description: 'AI and machine learning research' },
        { title: 'Hugging Face', url: 'https://huggingface.co/', description: 'Pretrained AI models and tools' }
    ],
    'react': [
        { title: 'React Official', url: 'https://react.dev/', description: 'A JavaScript library for building user interfaces' },
        { title: 'React Documentation', url: 'https://react.dev/learn', description: 'Complete React learning guide' },
        { title: 'React Router', url: 'https://reactrouter.com/', description: 'Client side routing for React applications' },
        { title: 'React Tutorial', url: 'https://www.w3schools.com/react/', description: 'Learn React framework step by step' },
        { title: 'Next.js Framework', url: 'https://nextjs.org/', description: 'React framework for production applications' }
    ],
    'vue': [
        { title: 'Vue.js Official', url: 'https://vuejs.org/', description: 'The Progressive JavaScript Framework' },
        { title: 'Vue Documentation', url: 'https://vuejs.org/guide/', description: 'Complete Vue.js guide and API reference' },
        { title: 'Vue Router', url: 'https://router.vuejs.org/', description: 'Official router for Vue.js' },
        { title: 'Vuex State Management', url: 'https://vuex.vuejs.org/', description: 'Centralized state management for Vue' },
        { title: 'Nuxt.js Framework', url: 'https://nuxtjs.org/', description: 'Vue.js framework for production apps' }
    ],
    'angular': [
        { title: 'Angular Official', url: 'https://angular.io/', description: 'Platform for building mobile and desktop apps' },
        { title: 'Angular Documentation', url: 'https://angular.io/docs', description: 'Complete Angular framework documentation' },
        { title: 'TypeScript', url: 'https://www.typescriptlang.org/', description: 'JavaScript with syntax for types' },
        { title: 'RxJS', url: 'https://rxjs.dev/', description: 'Reactive programming library for JavaScript' },
        { title: 'Angular Material', url: 'https://material.angular.io/', description: 'UI component library for Angular' }
    ],
    'css': [
        { title: 'CSS-Tricks', url: 'https://css-tricks.com/', description: 'Daily articles about CSS, HTML and JavaScript' },
        { title: 'MDN CSS Guide', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS', description: 'Complete CSS reference and tutorials' },
        { title: 'Flexbox Guide', url: 'https://css-tricks.com/snippets/css/a-guide-to-flexbox/', description: 'Complete guide to CSS Flexbox layout' },
        { title: 'Grid Guide', url: 'https://css-tricks.com/snippets/css/complete-guide-grid/', description: 'Complete guide to CSS Grid layout' },
        { title: 'Bootstrap Framework', url: 'https://getbootstrap.com/', description: 'Popular CSS framework for responsive design' }
    ],
    'html': [
        { title: 'HTML5 MDN Guide', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML', description: 'Complete HTML5 reference' },
        { title: 'W3Schools HTML', url: 'https://www.w3schools.com/html/', description: 'HTML tutorial and reference' },
        { title: 'HTML Elements', url: 'https://html.spec.whatwg.org/multipage/', description: 'HTML Living Standard specification' },
        { title: 'Semantic HTML', url: 'https://developer.mozilla.org/en-US/docs/Glossary/Semantics', description: 'Semantic HTML best practices' },
        { title: 'Accessibility', url: 'https://www.w3.org/WAI/', description: 'Web Accessibility Initiative guidelines' }
    ],
    'database': [
        { title: 'MongoDB Official', url: 'https://www.mongodb.com/', description: 'NoSQL database platform' },
        { title: 'PostgreSQL', url: 'https://www.postgresql.org/', description: 'Advanced open source database' },
        { title: 'MySQL', url: 'https://www.mysql.com/', description: 'Popular open source relational database' },
        { title: 'Firebase', url: 'https://firebase.google.com/', description: 'Backend as a service by Google' },
        { title: 'Redis', url: 'https://redis.io/', description: 'In-memory data structure store' }
    ],
    'git': [
        { title: 'Git Official', url: 'https://git-scm.com/', description: 'Free and open source version control system' },
        { title: 'GitHub', url: 'https://github.com/', description: 'Where the world builds software' },
        { title: 'GitLab', url: 'https://about.gitlab.com/', description: 'Complete DevOps platform' },
        { title: 'Git Tutorial', url: 'https://www.w3schools.com/git/', description: 'Learn Git version control' },
        { title: 'Atlassian Git', url: 'https://www.atlassian.com/git', description: 'Git tutorials and guides' }
    ],
    'docker': [
        { title: 'Docker Official', url: 'https://www.docker.com/', description: 'Container platform for applications' },
        { title: 'Docker Documentation', url: 'https://docs.docker.com/', description: 'Complete Docker documentation' },
        { title: 'Docker Hub', url: 'https://hub.docker.com/', description: 'Container image registry' },
        { title: 'Kubernetes', url: 'https://kubernetes.io/', description: 'Open source container orchestration' },
        { title: 'Docker Compose', url: 'https://docs.docker.com/compose/', description: 'Tool for defining multi-container apps' }
    ],
    'api': [
        { title: 'REST API Best Practices', url: 'https://restfulapi.net/', description: 'RESTful API design guidelines' },
        { title: 'GraphQL Official', url: 'https://graphql.org/', description: 'Query language for APIs' },
        { title: 'OpenAPI', url: 'https://www.openapis.org/', description: 'API specification standard' },
        { title: 'Postman', url: 'https://www.postman.com/', description: 'API development and testing platform' },
        { title: 'Swagger UI', url: 'https://swagger.io/tools/swagger-ui/', description: 'Interactive API documentation' }
    ],
    'java': [
        { title: 'Java Official', url: 'https://www.java.com/', description: 'Official Java programming language' },
        { title: 'Java Documentation', url: 'https://docs.oracle.com/javase/', description: 'Complete Java API documentation' },
        { title: 'Spring Framework', url: 'https://spring.io/', description: 'Enterprise Java application framework' },
        { title: 'Learn Java', url: 'https://www.w3schools.com/java/', description: 'Java tutorials and references' },
        { title: 'Maven', url: 'https://maven.apache.org/', description: 'Java project build tool' }
    ],
    'ruby': [
        { title: 'Ruby Official', url: 'https://www.ruby-lang.org/', description: 'Official Ruby programming language' },
        { title: 'Ruby on Rails', url: 'https://rubyonrails.org/', description: 'Web development framework' },
        { title: 'Learn Ruby', url: 'https://www.learnrubyonline.org/', description: 'Interactive Ruby tutorials' },
        { title: 'Ruby Documentation', url: 'https://ruby-doc.org/', description: 'Complete Ruby API reference' },
        { title: 'Bundler', url: 'https://bundler.io/', description: 'Ruby dependency manager' }
    ],
    'kubernetes': [
        { title: 'Kubernetes Official', url: 'https://kubernetes.io/', description: 'Open source container orchestration' },
        { title: 'Kubernetes Documentation', url: 'https://kubernetes.io/docs/', description: 'Complete K8s documentation' },
        { title: 'Helm Package Manager', url: 'https://helm.sh/', description: 'Kubernetes package manager' },
        { title: 'kubectl CLI', url: 'https://kubernetes.io/docs/reference/kubectl/', description: 'Kubernetes command-line tool' },
        { title: 'Minikube', url: 'https://minikube.sigs.k8s.io/', description: 'Local Kubernetes development' }
    ],
    'laravel': [
        { title: 'Laravel Official', url: 'https://laravel.com/', description: 'PHP web application framework' },
        { title: 'Laravel Documentation', url: 'https://laravel.com/docs', description: 'Complete Laravel docs' },
        { title: 'Artisan CLI', url: 'https://laravel.com/docs/artisan', description: 'Laravel command-line interface' },
        { title: 'Eloquent ORM', url: 'https://laravel.com/docs/eloquent', description: 'Laravel database ORM' },
        { title: 'Composer', url: 'https://getcomposer.org/', description: 'PHP dependency manager' }
    ],
    'blockchain': [
        { title: 'Bitcoin', url: 'https://bitcoin.org/', description: 'Peer-to-peer electronic cash system' },
        { title: 'Ethereum', url: 'https://ethereum.org/', description: 'Smart contract blockchain platform' },
        { title: 'Blockchain Basics', url: 'https://www.ibm.com/cloud/learn/blockchain', description: 'What is blockchain technology' },
        { title: 'Solidity', url: 'https://soliditylang.org/', description: 'Ethereum smart contract language' },
        { title: 'Web3.js', url: 'https://web3js.readthedocs.io/', description: 'JavaScript library for blockchain' }
    ],
    'linux': [
        { title: 'Linux Foundation', url: 'https://www.linuxfoundation.org/', description: 'Official Linux organization' },
        { title: 'Linux Manual Pages', url: 'https://man7.org/linux/man-pages/', description: 'Complete Linux documentation' },
        { title: 'Ubuntu', url: 'https://ubuntu.com/', description: 'Popular Linux distribution' },
        { title: 'Linux Commands', url: 'https://www.linuxcommand.org/', description: 'Linux shell commands guide' },
        { title: 'Bash Scripting', url: 'https://www.gnu.org/software/bash/manual/', description: 'Bash shell programming' }
    ],
    'devops': [
        { title: 'DevOps Handbook', url: 'https://itrevolution.com/the-devops-handbook/', description: 'Guide to DevOps practices' },
        { title: 'CI/CD Pipelines', url: 'https://www.atlassian.com/continuous-delivery/ci-cd', description: 'Continuous integration and deployment' },
        { title: 'Infrastructure as Code', url: 'https://www.terraform.io/', description: 'Terraform IaC tool' },
        { title: 'Ansible', url: 'https://www.ansible.com/', description: 'Configuration management tool' },
        { title: 'Jenkins', url: 'https://www.jenkins.io/', description: 'Automation server for CI/CD' }
    ],
    'security': [
        { title: 'OWASP', url: 'https://owasp.org/', description: 'Web application security organization' },
        { title: 'Web Security Academy', url: 'https://portswigger.net/web-security', description: 'Free security training' },
        { title: 'Cybersecurity Essentials', url: 'https://www.cisco.com/site/us/en/learn/networking/networking-training/cybersecurity.html', description: 'Cybersecurity fundamentals' },
        { title: 'Encryption Guide', url: 'https://en.wikipedia.org/wiki/Encryption', description: 'Understanding encryption' },
        { title: 'Bug Bounty Platforms', url: 'https://www.hackerone.com/', description: 'Bug bounty and vulnerability programs' }
    ],
    'mobile development': [
        { title: 'Flutter', url: 'https://flutter.dev/', description: 'Cross-platform mobile framework' },
        { title: 'React Native', url: 'https://reactnative.dev/', description: 'JavaScript mobile framework' },
        { title: 'Swift', url: 'https://www.apple.com/swift/', description: 'iOS and macOS programming' },
        { title: 'Kotlin', url: 'https://kotlinlang.org/', description: 'Modern Android development language' },
        { title: 'Android Studio', url: 'https://developer.android.com/studio', description: 'Android development IDE' }
    ],
    'cloud computing': [
        { title: 'AWS', url: 'https://aws.amazon.com/', description: 'Amazon Web Services cloud platform' },
        { title: 'Google Cloud', url: 'https://cloud.google.com/', description: 'Google Cloud Platform' },
        { title: 'Microsoft Azure', url: 'https://azure.microsoft.com/', description: 'Microsoft cloud services' },
        { title: 'Cloud Computing Basics', url: 'https://www.ibm.com/cloud/learn/cloud-computing', description: 'What is cloud computing' },
        { title: 'Serverless Computing', url: 'https://www.ibm.com/cloud/learn/serverless', description: 'Serverless architecture' }
    ]
};

async function searchWikipedia(query) {
    try {
        const response = await getAxios().get('https://en.wikipedia.org/w/api.php', {
            params: {
                action: 'query',
                list: 'search',
                srsearch: query,
                format: 'json',
                srlimit: MAX_RESULTS
            },
            timeout: 3000
        });

        if (!response.data.query?.search || response.data.query.search.length === 0) {
            return [];
        }

        return response.data.query.search.slice(0, MAX_RESULTS).map(item => ({
            title: item.title,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
            description: stripHtml(item.snippet).substring(0, 100),
            source: 'Wikipedia'
        }));
    } catch (err) {
        console.log(`[SEARCH] Wikipedia API error: ${err.message}`);
        return [];
    }
}

// Générer des résultats intelligents pour toute requête
function generateSmartResults(query) {
    const queryLower = query.toLowerCase();
    
    // Créer des résultats basés sur la requête
    const results = [];
    
    // Essayer de deviner le type de contenu
    const isLanguage = /^(python|javascript|java|c\+\+|ruby|go|rust|php|swift|kotlin|typescript|lua|perl|scala|haskell|elixir)/i.test(query);
    const isTool = /^(git|docker|kubernetes|jenkins|ansible|terraform|nginx|apache|mysql|postgresql|mongodb|redis|elasticsearch)/i.test(query);
    const isFramework = /^(react|vue|angular|django|flask|spring|laravel|express|fastapi|rails|asp\.net)/i.test(query);
    const isConcept = /^(algorithm|data structure|design pattern|architecture|microservice|api|rest|graphql|authentication|encryption)/i.test(query);
    
    // Générer des titres pertinents
    if (isLanguage) {
        results.push({
            title: `${query} - Official Documentation`,
            url: `https://www.${queryLower}.org/`,
            description: `Official documentation and resources for ${query} programming language`
        });
        results.push({
            title: `Learn ${query}`,
            url: `https://www.w3schools.com/${queryLower.replace(/\s+/g, '').toLowerCase()}/`,
            description: `Interactive tutorials and guides for ${query} programming`
        });
        results.push({
            title: `${query} Tutorial - GeeksforGeeks`,
            url: `https://www.geeksforgeeks.org/${query.toLowerCase()}-tutorial/`,
            description: `Comprehensive ${query} tutorial with examples`
        });
        results.push({
            title: `${query} - Stack Overflow`,
            url: `https://stackoverflow.com/questions/tagged/${queryLower}`,
            description: `Questions and answers about ${query} on Stack Overflow`
        });
        results.push({
            title: `${query} - GitHub`,
            url: `https://github.com/topics/${queryLower}`,
            description: `Open source ${query} projects on GitHub`
        });
    } else if (isTool) {
        results.push({
            title: `${query} - Official Website`,
            url: `https://www.${queryLower.replace(/\s+/g, '-')}.com/`,
            description: `Official documentation for ${query} tool`
        });
        results.push({
            title: `${query} Tutorial`,
            url: `https://www.w3schools.com/${queryLower.replace(/\s+/g, '')}/`,
            description: `Learn ${query} with interactive tutorials`
        });
        results.push({
            title: `${query} Documentation`,
            url: `https://docs.${queryLower.replace(/\s+/g, '-')}.io/`,
            description: `Complete ${query} documentation`
        });
        results.push({
            title: `${query} - GitHub`,
            url: `https://github.com/search?q=${queryLower}`,
            description: `${query} repositories and resources`
        });
        results.push({
            title: `${query} Guide - DigitalOcean`,
            url: `https://www.digitalocean.com/community/tutorials?q=${queryLower}`,
            description: `Guides and tutorials for ${query}`
        });
    } else if (isFramework) {
        results.push({
            title: `${query} - Official Documentation`,
            url: `https://${queryLower.replace(/\s+/g, '')}.io/`,
            description: `Official ${query} framework documentation`
        });
        results.push({
            title: `Learn ${query}`,
            url: `https://www.w3schools.com/${queryLower.replace(/\s+/g, '')}/`,
            description: `${query} tutorials and learning resources`
        });
        results.push({
            title: `${query} Tutorial`,
            url: `https://www.freecodecamp.org/search?query=${queryLower}`,
            description: `${query} courses and tutorials`
        });
        results.push({
            title: `${query} - GitHub`,
            url: `https://github.com/topics/${queryLower}`,
            description: `${query} projects on GitHub`
        });
        results.push({
            title: `${query} vs alternatives`,
            url: `https://www.npmtrends.com/${queryLower}`,
            description: `${query} popularity and comparisons`
        });
    } else if (isConcept) {
        results.push({
            title: `${query} - Wikipedia`,
            url: `https://en.wikipedia.org/wiki/${query.replace(/\s+/g, '_')}`,
            description: `Overview and explanation of ${query}`
        });
        results.push({
            title: `${query} - GeeksforGeeks`,
            url: `https://www.geeksforgeeks.org/${query.toLowerCase().replace(/\s+/g, '-')}/`,
            description: `Detailed guide to ${query}`
        });
        results.push({
            title: `${query} Tutorial`,
            url: `https://www.tutorialspoint.com/${query.toLowerCase().replace(/\s+/g, '_')}.htm`,
            description: `Learn ${query} with examples`
        });
        results.push({
            title: `${query} on MDN`,
            url: `https://developer.mozilla.org/en-US/docs/Web`,
            description: `${query} in web development`
        });
        results.push({
            title: `${query} - Dev.to`,
            url: `https://dev.to/search?q=${queryLower}`,
            description: `Articles about ${query}`
        });
    } else {
        // Résultats génériques pour n'importe quelle requête
        results.push({
            title: `${query} - Wikipedia`,
            url: `https://en.wikipedia.org/wiki/${query.replace(/\s+/g, '_')}`,
            description: `Wikipedia article about ${query}`
        });
        results.push({
            title: `${query} - Google Search`,
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            description: `Search results for "${query}"`
        });
        results.push({
            title: `${query} - YouTube`,
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
            description: `Video tutorials and content about ${query}`
        });
        results.push({
            title: `${query} - Stack Overflow`,
            url: `https://stackoverflow.com/search?q=${encodeURIComponent(query)}`,
            description: `Questions and answers about ${query}`
        });
        results.push({
            title: `${query} - Medium`,
            url: `https://medium.com/search?q=${encodeURIComponent(query)}`,
            description: `Articles and stories about ${query}`
        });
    }
    
    return results;
}

function searchDatabase(query) {
    const queryLower = query.toLowerCase();
    
    // Recherche exacte dans les clés
    if (SEARCH_DATABASE[queryLower]) {
        return SEARCH_DATABASE[queryLower];
    }

    // Recherche partielle - vérifier si la requête contient une clé
    for (const [key, data] of Object.entries(SEARCH_DATABASE)) {
        if (queryLower.includes(key.toLowerCase()) || key.toLowerCase().includes(queryLower)) {
            return data;
        }
    }

    return [];
}

async function performSearch(query) {
    // Vérifier le cache
    const cacheKey = query.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`[SEARCH] Cache hit for: "${query}"`);
        return cached.data;
    }

    let results = [];

    // 1. Chercher sur DuckDuckGo pour obtenir de vrais résultats web
    console.log(`[SEARCH] Searching DuckDuckGo for: "${query}"`);
    results = await searchDuckDuckGo(query);
    if (results.length > 0) {
        console.log(`[SEARCH] Found on DuckDuckGo for: "${query}"`);
    }

    // 2. Si DuckDuckGo échoue, chercher dans la base de données locale
    if (results.length === 0) {
        results = searchDatabase(query);
        if (results.length > 0) {
            console.log(`[SEARCH] Found in database for: "${query}"`);
        }
    }

    // 3. Si rien trouvé localement, chercher sur Wikipedia
    if (results.length === 0) {
        console.log(`[SEARCH] Searching Wikipedia for: "${query}"`);
        results = await searchWikipedia(query);
    }

    // 4. Si Wikipedia échoue, générer des résultats intelligents
    if (results.length === 0) {
        console.log(`[SEARCH] Generating smart results for: "${query}"`);
        results = generateSmartResults(query);
    }

    // 5. Mettre en cache les résultats
    if (results && results.length > 0) {
        searchCache.set(cacheKey, {
            data: results,
            timestamp: Date.now()
        });
    }

    return results;
}

module.exports = {
    name: "search",
    aliases: ["recherche", "ddg", "google", "cherche"],
    description: "Effectue une recherche sur DuckDuckGo et envoie les résultats",

    async execute(sock, m, args) {
        const query = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Format', `${config.prefix}search <requête>`)}\n${keyValue('Exemple 1', `${config.prefix}search JavaScript`)}\n${keyValue('Exemple 2', `${config.prefix}ddg actualités IA`)}\n${keyValue('Exemple 3', `${config.prefix}cherche machine learning`)}`,
                    { title: '🔍 RECHERCHE', status: 'warning' }
                )
            });
        }

        try {
            console.log(`[SEARCH] Recherche: "${query}"`);
            
            const [results, images] = await Promise.all([
                performSearch(query),
                searchDuckDuckGoImages(query)
            ]);

            console.log(`[SEARCH] Résultats trouvés: ${results?.length ?? 0}`);
            console.log(`[SEARCH] Images trouvées: ${images?.length ?? 0}`);

            if (!results || results.length === 0) {
                return sock.sendMessage(m.chat, {
                    text: formatMessage(
                        `${keyValue('Requête', query)}\n${keyValue('Status', 'Aucun résultat trouvé')}\n${keyValue('Conseil', 'Essaie une requête différente')}`,
                        { title: '🔍 RECHERCHE', status: 'warning' }
                    )
                });
            }

            let resultText = `*🔍 Résultats pour: ${query}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            results.forEach((result, index) => {
                resultText += `*${index + 1}. ${result.title || 'Sans titre'}*\n`;
                if (result.source) {
                    resultText += `Source: ${result.source}\n`;
                }
                if (result.description && result.description.trim()) {
                    const desc = result.description.substring(0, 110);
                    resultText += `${desc}${result.description.length > 110 ? '...' : ''}\n`;
                }
                if (result.url && result.url.trim()) {
                    resultText += `🔗 ${result.url}\n`;
                }
                resultText += '\n';
            });

            await sock.sendMessage(m.chat, {
                text: formatMessage(resultText.trim(), { title: '🔍 RECHERCHE', frameType: 'shadow' })
            });

            if (images && images.length > 0) {
                const imageText = formatImageResults(images);
                const preview = images[0];

                try {
                    const imageBuffer = await downloadImageBuffer(preview.image || preview.thumbnail);
                    await sock.sendMessage(m.chat, {
                        image: imageBuffer,
                        caption: formatMessage(imageText, { title: '🖼️ IMAGES', frameType: 'shadow' })
                    });
                } catch (imageErr) {
                    console.log(`[SEARCH] Aperçu image non envoyé: ${imageErr.message}`);
                    await sock.sendMessage(m.chat, {
                        text: formatMessage(imageText, { title: '🖼️ IMAGES', frameType: 'shadow' })
                    });
                }
            }

        } catch (err) {
            console.log(`[SEARCH] Erreur: ${err.message}`);
            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Status', 'Erreur')}\n${keyValue('Message', 'Impossible d\'effectuer la recherche')}\n${keyValue('Conseil', 'Réessaie dans quelques instants')}`,
                    { title: '❌ RECHERCHE', status: 'error' }
                )
            });
        }
    }
};
