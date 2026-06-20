# Airtek TV para TizenBrew

Port web del cliente IPTV de Airtek (originalmente app nativa Android `com.airtek.smarttv`)
para correr en **TVs Samsung Tizen** a través de **[TizenBrew](https://github.com/reisxd/TizenBrew)**.

Inspirado en la estructura de [`@foxreis/tizentube`](https://www.npmjs.com/package/@foxreis/tizentube),
pero TizenTube *inyecta JS* en una web (YouTube). Airtek TV es nativa, así que esto es un **port**:
una app web que consume el **mismo backend de Airtek**.

## Cómo funciona

- **Catálogo (público):** `GET https://api.cloud.airteknet.io/api/v1/channels-manager-ms/get/channels/android/2.14`
  Devuelve ~87 canales con `{ id, title, url (.m3u8), backup_url, thumbnail, categories.tags, order, hasDrm }`.
- **Sin login / sin DRM:** en este feed todos los canales son `hasDrm:false`. La autenticación es por **IP de la red Airtek**: los streams `.m3u8` solo se sirven a clientes dentro de la red Airtek (Venezuela).
- **Reproducción:** HLS vía `hls.js` con fallback a HLS nativo de Tizen.
- **Navegación:** control remoto (flechas, OK, Atrás, Ch+/Ch-).

## Estructura

```
airtektv-tizen/
├── package.json          # manifiesto TizenBrew (packageType: "app")
├── app/
│   ├── index.html        # UI
│   ├── config.js         # endpoint y parámetros
│   ├── styles.css        # estilos para TV 1920x1080
│   ├── app.js            # lógica: catálogo, navegación, reproductor
│   └── mock/channels.json# catálogo real cacheado (fallback offline)
└── tools/dev-server.js   # preview en navegador de escritorio
```

## Probar en el PC (requiere Node.js)

```bash
node tools/dev-server.js
# abrir http://localhost:8080
```

> Nota: la **UI** se navega bien en el PC (usa el catálogo cacheado si el API no responde),
> pero los **streams NO reproducen fuera de la red Airtek**. La reproducción se valida en la TV.

## Instalar en la TV (TizenBrew, desde GitHub)

TizenBrew carga los módulos desde jsDelivr, que sirve repos públicos de GitHub
(`cdn.jsdelivr.net/gh/usuario/repo`). No hace falta publicar en npm.

1. Instala TizenBrew en la TV Samsung (Tizen 3.0+ / 2017+).
2. Abre el **Module Manager** → botón **verde** → opción **GitHub**.
3. Escribe:
   ```
   baddiamond/airtektv-tizen@main
   ```
   (el `@main` fija la rama; al actualizar el repo, jsDelivr refresca su caché en unas horas).
4. Vuelve a la lista de módulos: aparecerá **Airtek TV**. Ábrelo.

> El repo debe ser **público**. La API de Airtek permite CORS (`*`), así que la app
> consume `api.cloud.airteknet.io` directo, sin proxy. Los streams solo reproducen
> dentro de la red Airtek.

## Pendientes / siguientes pasos

- Validar reproducción HLS real en la TV (dentro de la red Airtek).
- Confirmar política CORS del API desde el contexto de app Tizen (si bloquea, usar `serviceFile` como proxy).
- EPG/guía de programación (no detectada en el APK; confirmar si existe endpoint).
- Empaquetado `.wgt` standalone con Tizen Studio (opcional, si no se quiere depender de TizenBrew).

---

## Ruta futura (documentada, NO implementada): feed `web/1.3` con DRM

> Estado: **pospuesto**. El cliente actual usa `android/2.14` (HLS sin DRM) que ya cubre todos
> los canales. Esta sección documenta cómo es el cliente WEB oficial (`https://airtek.tv`) por si
> en el futuro se quiere paridad total (DASH + Widevine + control de sesiones).

**Catálogo web:** `GET .../get/channels/web/1.3` (DASH `.mpd`, con `hasDrm:true`).

**Ciclo de sesión (todo en `.../channels-manager-ms/`):**

1. **Crear sesión** — `POST /sessionToken` (sin auth). El `deviceId` lo genera el cliente
   (UUID con prefijo `web_`, persistido en `localStorage`):
   ```
   body: {"deviceId":"web_<uuid>","operatingSystem":"WEB"}
   resp: { token, expiresAt, deviceId, ipAddress, ontSerial,
           activeSessionsOnIp, licenseUrl, appleCertificateUrl,
           refreshIntervalSeconds }
   ```
2. **Renovar** — cada `refreshIntervalSeconds` (≈50s): `POST /sessionRefresh`
   con `Authorization: Bearer <token>` y body `{}` → devuelve un token nuevo (mismo `jti`, +60s).
3. **Cerrar** — al salir (`beforeunload`): `POST /sessionClose` con Bearer y body `{}`
   → `{"message":"Session closed successfully"}`.
4. Token expirado → `401 "Session not active anymore. Request a new token"`.

**DRM:** Widevine vía **Axinom**. La `licenseUrl` llega en la respuesta de `sessionToken`
(p. ej. `https://<id>.drm-widevine-licensing.axprod.net/AcquireLicense`). `appleCertificateUrl`
es `null` (sin FairPlay). En Tizen se reproduciría con **Shaka Player** (Widevine por EME en
modelos Samsung recientes; PlayReady nativo como alternativa). Falta capturar un request de
licencia/manifest para confirmar cómo viaja el token al license server.

**Auth de identidad:** no hay login. El backend identifica al suscriptor por la **IP de la red
Airtek** + el **`ontSerial`** (módem de fibra). `sessionLimitApplied:true` limita sesiones por IP.
```
