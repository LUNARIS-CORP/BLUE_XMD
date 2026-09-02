const axios = require('axios');
const config = require('../config');
const { formatMessage, keyValue } = require('../lib/messageStyler');

const GOOGLE_API_KEY = process.env.GOOGLE_IMAGE_API_KEY || process.env.GOOGLE_API_KEY || 'AIzaSyDo09jHOJqL6boMeac-xmPHB-yD9dKOKGU';
const GOOGLE_CX = process.env.GOOGLE_IMAGE_CX || process.env.GOOGLE_CX || 'd1a5b18a0be544a0e';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const IMAGE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

module.exports = {
    name: 'pinterest',
    aliases: ['pin', 'pins', 'img'],
    description: "Recherche des images via plusieurs sources",

    async execute(sock, m, args) {
        if (!args.length) {
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Usage', `${config.prefix}img ordinateur -5`)}\n` +
                    `${keyValue('Exemple', `${config.prefix}pinterest kyotaka ayanokoji -10`)}\n` +
                    `${keyValue('Defaut', '5 images')}`,
                    { title: '🖼️ IMAGE SEARCH', status: 'warning' }
                )
            });
        }

        const { query, limit } = parseImageSearchArgs(args);

        if (!query) {
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    'Veuillez indiquer un terme de recherche.',
                    { title: '❌ IMAGE SEARCH', status: 'error' }
                )
            });
        }

        await sock.sendMessage(m.chat, {
            text: formatMessage(
                `${keyValue('Recherche', query)}\n${keyValue('Images', limit)}\n${keyValue('Source', getProviderLabel())}`,
                { title: '🔍 IMAGE SEARCH', includeFooter: false }
            )
        });

        try {
            const imageUrls = await searchImages(query, limit);

            if (imageUrls.length === 0) {
                return sock.sendMessage(m.chat, {
                    text: formatMessage(
                        `${keyValue('Recherche', query)}\n${keyValue('Resultat', 'aucune image trouvee')}`,
                        { title: '❌ IMAGE SEARCH', status: 'error' }
                    )
                });
            }

            let sentCount = 0;

            for (const [index, item] of imageUrls.entries()) {
                try {
                    const imageBuffer = await downloadImage(item.url);
                    await sock.sendMessage(m.chat, {
                        image: imageBuffer,
                        caption: formatMessage(
                            `${keyValue('Recherche', query)}\n` +
                            `${keyValue('Image', `${index + 1}/${imageUrls.length}`)}\n` +
                            `${keyValue('Source', item.source)}\n` +
                            `${item.title ? `${keyValue('Titre', item.title)}\n` : ''}` +
                            `${keyValue('Lien', shortenUrl(item.url, 60))}\n` +
                            `${keyValue('Bot', config.name)}`,
                            { title: '🖼️ IMAGE RESULT', frameType: 'shadow', includeFooter: false }
                        )
                    });
                    sentCount++;
                    await delay(500);
                } catch (err) {
                    console.log(`Erreur envoi image: ${err.message}`);
                }
            }

            if (sentCount === 0) {
                await sock.sendMessage(m.chat, {
                    text: formatMessage(
                        `${keyValue('Recherche', query)}\n${keyValue('Erreur', "Impossible d'envoyer les images")}`,
                        { title: '❌ IMAGE SEARCH', status: 'error' }
                    )
                });
            }
        } catch (error) {
            console.error('Erreur image search:', error.message);
            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    "Impossible de recuperer les images.",
                    { title: '❌ IMAGE SEARCH', status: 'error' }
                )
            });
        }
    }
};

async function searchImages(query, limit) {
    const providers = [
        searchPinterestImages,
        searchPexelsImages,
        searchUnsplashImages,
        searchGoogleImages,
        searchDuckDuckGoImages
    ];

    for (const provider of providers) {
        try {
            const results = await provider(query, limit);
            if (results.length > 0) return dedupeImageResults(results).slice(0, limit);
        } catch (error) {
            console.error(`Image provider failed (${provider.name}):`, error.message);
        }
    }

    return [];
}

async function searchPinterestImages(query, limit) {
    const data = {
        options: {
            query,
            scope: 'pins',
            page_size: limit,
            bookmarks: []
        },
        context: {}
    };

    const response = await axios.get('https://www.pinterest.com/resource/BaseSearchResource/get/', {
        params: {
            source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
            data: JSON.stringify(data)
        },
        timeout: 15000,
        headers: {
            'User-Agent': IMAGE_USER_AGENT,
            'Accept': 'application/json,text/plain,*/*',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            'Referer': `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
            'X-Requested-With': 'XMLHttpRequest'
        }
    });

    const results = response.data?.resource_response?.data?.results || [];
    return results
        .map(pin => {
            const images = pin.images || {};
            const url = images.orig?.url ||
                images['736x']?.url ||
                images['564x']?.url ||
                images['474x']?.url ||
                images['236x']?.url;

            return {
                url,
                title: pin.grid_title || pin.title || pin.description || '',
                source: 'Pinterest'
            };
        })
        .filter(item => item.url)
        .slice(0, limit);
}

async function searchPexelsImages(query, limit) {
    if (!PEXELS_API_KEY) return [];

    const response = await axios.get('https://api.pexels.com/v1/search', {
        params: {
            query,
            per_page: limit,
            orientation: 'all',
            locale: 'fr-FR'
        },
        timeout: 15000,
        headers: {
            Authorization: PEXELS_API_KEY
        }
    });

    return (response.data?.photos || [])
        .map(photo => ({
            url: photo.src?.large2x || photo.src?.large || photo.src?.original,
            title: photo.alt || '',
            source: 'Pexels'
        }))
        .filter(item => item.url);
}

async function searchUnsplashImages(query, limit) {
    if (!UNSPLASH_ACCESS_KEY) return [];

    const response = await axios.get('https://api.unsplash.com/search/photos', {
        params: {
            query,
            per_page: limit,
            content_filter: 'high'
        },
        timeout: 15000,
        headers: {
            Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`
        }
    });

    return (response.data?.results || [])
        .map(photo => ({
            url: photo.urls?.regular || photo.urls?.full || photo.urls?.raw,
            title: photo.alt_description || photo.description || '',
            source: 'Unsplash'
        }))
        .filter(item => item.url);
}

async function searchGoogleImages(query, limit) {
    if (!GOOGLE_API_KEY || !GOOGLE_CX) return [];

    try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                q: query,
                cx: GOOGLE_CX,
                searchType: 'image',
                key: GOOGLE_API_KEY,
                num: limit
            },
            timeout: 15000
        });

        if (response.data.items && response.data.items.length > 0) {
            return response.data.items
                .map(item => ({
                    url: item.link,
                    title: item.title || '',
                    source: 'Google Images'
                }))
                .filter(item => item.url);
        }

        return [];
    } catch (error) {
        console.error('Error fetching from Google API:', error.message);
        return [];
    }
}

async function searchDuckDuckGoImages(query, limit) {
    const page = await axios.get('https://duckduckgo.com/', {
        params: { q: query },
        timeout: 15000,
        headers: {
            'User-Agent': IMAGE_USER_AGENT,
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
        }
    });

    const token = extractDuckDuckGoToken(page.data);
    if (!token) return [];

    const response = await axios.get('https://duckduckgo.com/i.js', {
        params: {
            l: 'fr-fr',
            o: 'json',
            q: query,
            vqd: token,
            f: ',,,',
            p: '1'
        },
        timeout: 15000,
        headers: {
            'User-Agent': IMAGE_USER_AGENT,
            Referer: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
        }
    });

    return (response.data?.results || [])
        .map(item => ({
            url: item.image,
            title: item.title || '',
            source: 'DuckDuckGo Images'
        }))
        .filter(item => item.url)
        .slice(0, limit);
}

function extractDuckDuckGoToken(html = '') {
    const text = String(html || '');
    return text.match(/vqd=['"]([^'"]+)['"]/)?.[1] ||
        text.match(/"vqd":"([^"]+)"/)?.[1] ||
        text.match(/vqd=([^&"'\\]+)/)?.[1] ||
        '';
}

function dedupeImageResults(items = []) {
    const seen = new Set();
    const unique = [];

    for (const item of items) {
        const url = String(item?.url || '').trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        unique.push({
            url,
            title: String(item.title || '').trim(),
            source: item.source || 'Images'
        });
    }

    return unique;
}

async function downloadImage(url) {
    const { data, headers } = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: 10 * 1024 * 1024,
        headers: {
            'User-Agent': IMAGE_USER_AGENT,
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
    });

    const contentType = String(headers?.['content-type'] || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) {
        throw new Error(`URL non image (${contentType})`);
    }

    return Buffer.from(data);
}

function getProviderLabel() {
    const labels = [];
    labels.push('Pinterest');
    if (PEXELS_API_KEY) labels.push('Pexels');
    if (UNSPLASH_ACCESS_KEY) labels.push('Unsplash');
    if (GOOGLE_API_KEY && GOOGLE_CX) labels.push('Google Images');
    labels.push('DuckDuckGo');
    return labels.join(' / ');
}

function parseImageSearchArgs(args) {
    let query = '';
    let limit = 5;

    for (const arg of args) {
        if (arg.startsWith('-') && !Number.isNaN(parseInt(arg.slice(1), 10))) {
            limit = parseInt(arg.slice(1), 10);
        } else {
            query += `${query ? ' ' : ''}${arg}`;
        }
    }

    if (limit > 10) limit = 10;
    if (limit < 1) limit = 1;

    return {
        query: query.trim(),
        limit
    };
}

function shortenUrl(url, maxLength = 50) {
    const text = String(url || '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
