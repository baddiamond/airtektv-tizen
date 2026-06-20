// Configuración del cliente Airtek TV (TizenBrew)
// Endpoint descubierto por ingeniería inversa del APK com.airtek.smarttv v2.14.
window.AIRTEK_CONFIG = {
  // Base del microservicio de canales
  apiBase: 'https://api.cloud.airteknet.io/api/v1/channels-manager-ms',
  // El catálogo se pide como get/channels/{provide}/{version}
  provider: 'android',
  version: '2.14',

  // Si la llamada al API falla (p. ej. sin red o CORS en desarrollo),
  // se usa este catálogo local para poder navegar la UI igualmente.
  mockUrl: 'mock/channels.json',

  // Tiempo máximo de espera para el API (ms)
  fetchTimeoutMs: 12000,

  // Vista previa en vivo en el spotlight (recuadro grande de la guía).
  // Si en la TV se siente lento/raro, poner en false para volver al logo estático.
  spotlightPreview: true,
  previewDelayMs: 1200,   // espera tras quedarse quieto en un canal antes de previsualizar
};

// --- Perfil WEB con DRM (POSPUESTO — ver README "Ruta futura"). ---
// Para activar la paridad con el cliente web oficial (DASH + Widevine + sesión),
// cambiar provider/version y completar el ciclo de sesión en app.js.
// window.AIRTEK_CONFIG.provider = 'web';
// window.AIRTEK_CONFIG.version  = '1.3';
// window.AIRTEK_CONFIG.session = {
//   tokenUrl:   'https://api.cloud.airteknet.io/api/v1/channels-manager-ms/sessionToken',
//   refreshUrl: 'https://api.cloud.airteknet.io/api/v1/channels-manager-ms/sessionRefresh',
//   closeUrl:   'https://api.cloud.airteknet.io/api/v1/channels-manager-ms/sessionClose',
//   operatingSystem: 'WEB',   // en Tizen podría usarse 'TIZEN' si el backend lo acepta
// };
// El licenseUrl (Widevine/Axinom) y refreshIntervalSeconds llegan en la respuesta de sessionToken.
