let sharp = null;
try {
    sharp = require('sharp');
} catch (err) {
    console.warn('sharp indisponible, certaines commandes sticker/image seront désactivées.');
}
const Pino = require('pino');
const { execFile } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const execFileAsync = promisify(execFile);

function buildDownloadableMessage(media) {
    if (!media) throw new Error('Média introuvable');

    if (media.message) {
        return {
            key: media.key || {},
            message: media.message
        };
    }

    if (!media.type || !media.content) {
        throw new Error('Format de média invalide');
    }

    return {
        key: media.key || {},
        message: {
            [media.type]: media.content
        }
    };
}

async function downloadMediaBuffer(sock, media) {
    const downloadable = buildDownloadableMessage(media);
    const reuploadRequest = typeof sock?.updateMediaMessage === 'function'
        ? sock.updateMediaMessage.bind(sock)
        : undefined;

    return downloadMediaMessage(
        downloadable,
        'buffer',
        {},
        {
            logger: Pino({ level: 'silent' }),
            reuploadRequest
        }
    );
}

async function imageToSticker(buffer) {
    if (!sharp) throw new Error('La dépendance sharp est indisponible sur cet environnement.');
    return sharp(buffer, { animated: true })
        .rotate()
        .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 80 })
        .toBuffer();
}

async function webpToSticker(buffer) {
    if (!sharp) throw new Error('La dépendance sharp est indisponible sur cet environnement.');
    return sharp(buffer, { animated: true })
        .webp({ quality: 80 })
        .toBuffer();
}

async function videoToSticker(buffer, options = {}) {
    const maxDurationSeconds = Number(options.maxDurationSeconds || 6);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'n9ufs-sticker-'));
    const inputPath = path.join(tempDir, `${randomUUID()}.mp4`);
    const outputPath = path.join(tempDir, `${randomUUID()}.webp`);

    try {
        await fs.writeFile(inputPath, buffer);

        await execFileAsync('ffmpeg', [
            '-y',
            '-i', inputPath,
            '-t', String(maxDurationSeconds),
            '-an',
            '-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
            '-vcodec', 'libwebp',
            '-lossless', '0',
            '-compression_level', '6',
            '-q:v', '60',
            '-loop', '0',
            '-vsync', '0',
            outputPath
        ], { maxBuffer: 1024 * 1024 * 8 });

        return fs.readFile(outputPath);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

function createStickerExif(packname, author) {
    const payload = Buffer.from(JSON.stringify({
        'sticker-pack-id': 'com.n9ufs.bot',
        'sticker-pack-name': packname || 'We are',
        'sticker-pack-publisher': author || 'N9uf_S',
        emojis: ['']
    }), 'utf8');

    const header = Buffer.from([
        0x49, 0x49, 0x2A, 0x00,
        0x08, 0x00, 0x00, 0x00,
        0x01, 0x00,
        0x41, 0x57,
        0x07, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x16, 0x00, 0x00, 0x00
    ]);

    const exif = Buffer.concat([header, payload]);
    exif.writeUInt32LE(payload.length, 14);
    return exif;
}

function addExifChunkToWebp(webpBuffer, exifBuffer, metadata = {}) {
    if (webpBuffer.toString('ascii', 0, 4) !== 'RIFF' || webpBuffer.toString('ascii', 8, 12) !== 'WEBP') {
        throw new Error('WebP invalide');
    }

    const chunks = [];
    let offset = 12;
    let vp8xIndex = -1;

    while (offset + 8 <= webpBuffer.length) {
        const id = webpBuffer.toString('ascii', offset, offset + 4);
        const size = webpBuffer.readUInt32LE(offset + 4);
        const dataStart = offset + 8;
        const dataEnd = dataStart + size;

        if (dataEnd > webpBuffer.length) break;

        const data = Buffer.from(webpBuffer.slice(dataStart, dataEnd));
        if (id === 'VP8X') vp8xIndex = chunks.length;
        if (id !== 'EXIF') {
            chunks.push({ id, data });
        }

        offset = dataEnd + (size % 2);
    }

    if (vp8xIndex === -1) {
        const vp8x = createVp8xChunkData(metadata);
        chunks.unshift({ id: 'VP8X', data: vp8x });
        vp8xIndex = 0;
    }

    chunks[vp8xIndex].data[0] |= 0x08;

    const exifChunk = { id: 'EXIF', data: exifBuffer };
    chunks.splice(vp8xIndex + 1, 0, exifChunk);

    const chunkBuffers = chunks.map(({ id, data }) => {
        const header = Buffer.alloc(8);
        header.write(id, 0, 4, 'ascii');
        header.writeUInt32LE(data.length, 4);
        return data.length % 2 === 0
            ? Buffer.concat([header, data])
            : Buffer.concat([header, data, Buffer.from([0x00])]);
    });

    const body = Buffer.concat([Buffer.from('WEBP'), ...chunkBuffers]);
    const riff = Buffer.alloc(8);
    riff.write('RIFF', 0, 4, 'ascii');
    riff.writeUInt32LE(body.length, 4);

    return Buffer.concat([riff, body]);
}

function createVp8xChunkData(metadata = {}) {
    const width = Math.max(1, Number(metadata.width || 512));
    const height = Math.max(1, Number(metadata.height || 512));
    const data = Buffer.alloc(10);

    data[0] = 0x08;
    if (metadata.hasAlpha) data[0] |= 0x10;
    if (metadata.pages && metadata.pages > 1) data[0] |= 0x02;

    writeUInt24LE(data, Math.min(width - 1, 0xFFFFFF), 4);
    writeUInt24LE(data, Math.min(height - 1, 0xFFFFFF), 7);
    return data;
}

function writeUInt24LE(buffer, value, offset) {
    buffer[offset] = value & 0xFF;
    buffer[offset + 1] = (value >> 8) & 0xFF;
    buffer[offset + 2] = (value >> 16) & 0xFF;
}

async function buildStickerFromImage(buffer, options = {}) {
    if (!sharp) throw new Error('La dépendance sharp est indisponible sur cet environnement.');
    const webp = await imageToSticker(buffer);
    const metadata = await sharp(webp, { animated: true }).metadata();
    return addExifChunkToWebp(webp, createStickerExif(options.packname, options.author), metadata);
}

async function buildStickerFromWebp(buffer, options = {}) {
    if (!sharp) throw new Error('La dépendance sharp est indisponible sur cet environnement.');
    const webp = await webpToSticker(buffer);
    const metadata = await sharp(webp, { animated: true }).metadata();
    return addExifChunkToWebp(webp, createStickerExif(options.packname, options.author), metadata);
}

async function buildStickerFromVideo(buffer, options = {}) {
    if (!sharp) throw new Error('La dépendance sharp est indisponible sur cet environnement.');
    const webp = await videoToSticker(buffer, options);
    const metadata = await sharp(webp, { animated: true }).metadata();
    return addExifChunkToWebp(webp, createStickerExif(options.packname, options.author), {
        width: metadata.width || 512,
        height: metadata.pageHeight || metadata.height || 512,
        pages: metadata.pages || 2,
        hasAlpha: true
    });
}

module.exports = {
    downloadMediaBuffer,
    buildStickerFromImage,
    buildStickerFromWebp,
    buildStickerFromVideo
};
