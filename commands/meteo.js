// commands/meteo.js - Météo simple
const axios = require('axios');
const config = require('../config');
const { formatMessage, keyValue } = require('../lib/messageStyler');

module.exports = {
    name: "meteo",
    aliases: ["météo", "weather"],
    description: "Affiche la météo d'une ville",

    async execute(sock, m, args) {
        const city = args.join(' ').trim();

        if (!city) {
            return sock.sendMessage(m.chat, {
                text: formatMessage(`${keyValue('Usage', `${config.prefix}meteo Abidjan`)}\n${keyValue('Exemple', `${config.prefix}meteo Bouaké`)}`, { title: '🌦️ MÉTÉO', status: 'warning' })
            });
        }

        try {
            const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=fr`;
            const res = await axios.get(url, { timeout: 10000 });
            const current = res.data.current_condition?.[0];
            const area = res.data.nearest_area?.[0];

            if (!current || !area) throw new Error('Météo indisponible');

            const location = area.areaName?.[0]?.value || city;
            const country = area.country?.[0]?.value || '';
            const desc = current.lang_fr?.[0]?.value || current.weatherDesc?.[0]?.value || 'Indisponible';

            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Ville', `${location}${country ? `, ${country}` : ''}`)}\n` +
                    `${keyValue('Temps', desc)}\n` +
                    `${keyValue('Température', `${current.temp_C}°C`)}\n` +
                    `${keyValue('Ressenti', `${current.FeelsLikeC}°C`)}\n` +
                    `${keyValue('Humidité', `${current.humidity}%`)}\n` +
                    `${keyValue('Vent', `${current.windspeedKmph} km/h`)}`,
                    { title: '🌦️ MÉTÉO', frameType: 'shadow' }
                )
            });
        } catch (err) {
            console.error('Erreur meteo:', err.message);
            const errorMessage = err.response?.status === 404
                ? "Ville introuvable. Veuillez vérifier le nom de la ville."
                : "Impossible de récupérer la météo. Veuillez réessayer plus tard.";

            await sock.sendMessage(m.chat, {
                text: formatMessage(errorMessage, { title: '❌ MÉTÉO', status: 'error' })
            });
        }
    }
};
