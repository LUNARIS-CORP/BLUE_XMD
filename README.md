# BLUE_XMD

<div align="center">
  <a href="https://git.io/typing-svg">
    <img src="https://readme-typing-svg.demolab.com?font=Jersey+20+Charted&size=88&pause=1000&color=1E90FF&center=true&width=1100&height=140&lines=BLUE_XMD;WhatsApp+Bot;Developed+by+LUNARIS" alt="BLUE_XMD title" />
  </a>
</div>

<div align="center">
  <img src="https://img.shields.io/badge/Projet-BLUE_XMD-1E90FF?style=for-the-badge" alt="Projet BLUE_XMD" />
  <img src="https://img.shields.io/github/stars/LUNARIS-CORP/BLUE_XMD?style=for-the-badge" alt="GitHub stars" />
  <img src="https://img.shields.io/github/forks/LUNARIS-CORP/BLUE_XMD?style=for-the-badge" alt="GitHub forks" />
  <img src="https://img.shields.io/github/watchers/LUNARIS-CORP/BLUE_XMD?style=for-the-badge" alt="GitHub watchers" />
</div>

<div align="center">
  <a href="https://t.me/LUNARISCORP">
    <img src="https://img.shields.io/badge/Telegram-Rejoindre%20le%20canal-0088CC?style=for-the-badge&logo=telegram" alt="Telegram" />
  </a>
  <a href="https://whatsapp.com/channel/0029VbD9z1YJf05TqVGLNo3c">
    <img src="https://img.shields.io/badge/WhatsApp-Rejoindre%20le%20canal-25D366?style=for-the-badge&logo=whatsapp" alt="WhatsApp" />
  </a>
</div>

BLUE_XMD est un bot WhatsApp développé par LUNARIS-CORP. Il est conçu pour la gestion de groupes, la modération, l’automatisation, les commandes utiles, les stickers, les outils médias et plusieurs fonctions pratiques au quotidien.

<div align="center">
  <img src="assets/bot_image.jpg" alt="BLUE_XMD banner" width="520" />
</div>

## Développeur

Ce projet est développé et maintenu par LUNARIS.

## Fonctionnalités

- Gestion de groupes WhatsApp
- Commandes admin et modération
- Anti-lien, anti-tag, anti-suppression et anti-mots interdits
- Système d’avertissements
- Commandes fun et jeux
- Stickers et outils médias
- Téléchargement audio/vidéo
- Commandes IA selon la configuration
- Automatisation des messages, réactions et statuts

## Structure du projet

- `commands/` : commandes du bot
- `lib/` : fonctions internes et utilitaires
- `data/` : fichiers de configuration et données persistantes
- `assets/` : images et fichiers médias du projet
- `index.js` : point d’entrée principal du bot
- `main.js` : gestion principale des messages et commandes

## Prérequis

- Node.js 18 ou plus récent
- npm
- Git
- FFmpeg recommandé pour les commandes audio/vidéo/sticker
- Un compte WhatsApp pour connecter le bot

## Installation sur PC, VPS ou serveur Linux

Cette méthode est la plus stable.

```bash
git clone https://github.com/LUNARIS-CORP/BLUE_XMD.git
cd BLUE_XMD
npm install --legacy-peer-deps
node index.js
```

Ensuite, suivez les instructions affichées dans le terminal pour connecter WhatsApp.

## Installation sur Termux Android

Sur Termux, certaines dépendances natives comme `sharp` et `sqlite3` peuvent échouer pendant l’installation, surtout sur Android/arm64. Dans cette version, elles sont optionnelles.

Si `sqlite3` est absent, le bot utilise automatiquement des fichiers JSON. Si `sharp` est absent, le bot démarre quand même, mais certaines commandes image/sticker seront limitées.

```bash
pkg update && pkg upgrade -y
pkg install git nodejs-lts python build-essential clang make ffmpeg -y
git clone https://github.com/LUNARIS-CORP/BLUE_XMD.git
cd BLUE_XMD
npm install --legacy-peer-deps --omit=optional
node index.js
```

Si le projet est déjà cloné sur votre téléphone :

```bash
cd ~/BLUE_XMD
rm -rf node_modules
npm install --legacy-peer-deps --omit=optional
node index.js
```

## Mettre à jour le bot

Pour récupérer les dernières modifications du dépôt :

```bash
cd ~/BLUE_XMD
git pull
npm install --legacy-peer-deps --omit=optional
node index.js
```

Sur PC ou VPS, vous pouvez aussi utiliser :

```bash
npm install --legacy-peer-deps
node index.js
```

## Démarrer le bot

```bash
npm start
```

ou directement :

```bash
node index.js
```

## Connexion WhatsApp

Au premier lancement, le bot affiche les instructions de connexion dans le terminal. Utilisez WhatsApp, puis allez dans :

```text
Paramètres > Appareils liés > Lier un appareil
```

Scannez le QR code ou entrez le code de jumelage si le bot en affiche un.

## Notes pour Termux

- Utilisez `--omit=optional` si `sharp` ou `sqlite3` bloquent l’installation.
- Les données SQLite seront remplacées par des fichiers JSON quand `sqlite3` n’est pas disponible.
- Les commandes qui nécessitent `sharp`, comme certaines fonctions image ou sticker, peuvent être désactivées sur Termux.
- Pour une expérience complète et plus stable, utilisez un VPS ou un serveur Linux.

## Licence

Ce projet est distribué sous licence MIT.

## Avertissement

BLUE_XMD est un projet WhatsApp indépendant et non officiel. Il est destiné à l’apprentissage, à l’expérimentation et à un usage personnel ou communautaire responsable. Respectez les conditions d’utilisation de WhatsApp et les lois applicables.
