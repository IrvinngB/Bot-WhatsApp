# WhastApp-Bot
Este proyecto es un bot de WhatsApp que integra la IA generativa de Google (Google Generative AI) y está diseñado para ofrecer soporte automatizado a los clientes de una tienda ficticia llamada ElectronicsJS. El bot se comunica a través de WhatsApp Web y responde automáticamente a las consultas de los usuarios sobre la tienda, productos disponibles, y puede agendar recordatorios.

Características
    Integración con Google Generative AI: El bot utiliza la API de Google para generar respuestas automatizadas y contextuales a los mensajes de los usuarios.
    Respuestas automatizadas: Responde a preguntas sobre la tienda (misión, visión, productos, políticas) y productos específicos (como laptops) extraídos de archivos locales.
    Gestión de horarios: Verifica automáticamente los horarios de apertura de la tienda en función de la zona horaria de Panamá.
    Agendamiento de recordatorios: Aunque esta función está actualmente bloqueada, el bot puede agendar recordatorios para fechas específicas o para un tiempo determinado.
    Interfaz gráfica con código QR: Utiliza un servidor Express.js y Socket.IO para generar y servir el código QR que permite iniciar la sesión de WhatsApp Web.