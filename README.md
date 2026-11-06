# Sistema de Calificaciones · ITP
U.E.N. “Monseñor Lucas Guillermo Castillo” · Área de Innovación Tecnológica y Productiva

Servidor Node.js (≥ 22.13, **sin dependencias**) + base de datos SQL (`schema.sql`) + interfaz web (`public/index.html`).

## Seguridad implementada
- Claves con **hash scrypt + sal aleatoria** (nunca en texto plano). Clave mínima de 8 caracteres.
- Estudiantes nuevos: clave inicial = su cédula; el sistema **obliga a cambiarla** antes de ver datos.
- Sesiones en el servidor (token aleatorio guardado como SHA-256), cookie `HttpOnly` + `SameSite=Strict` + `Secure`.
- **Permisos validados en el servidor**: el estudiante solo lee su propio boletín; solo el docente escribe.
- Bloqueo tras 8 intentos fallidos (15 min), notas validadas 0–20, cierre de sección que impide modificaciones, auditoría de acciones.

## Probar en tu computador
```
cp .env.example .env      # ajusta DOCENTE_CLAVE
npm start                 # http://localhost:3000
npm test                  # 22 pruebas automáticas
```
Docente: cédula `V-17.178.850` · clave inicial `itp2026` (cámbiala con el botón «Clave»).

## Publicarlo en internet (Render, Railway, Fly.io o un VPS con Docker)
1. Sube esta carpeta a un repositorio privado de GitHub.
2. Crea un **Web Service con Docker** apuntando al repositorio.
3. Agrega un **disco persistente** montado en `/data` (ahí vive `calificaciones.db`).
4. Variables de entorno: `COOKIE_SECURE=1`, `DOCENTE_CLAVE=<clave segura>`.
5. La plataforma da HTTPS; comparte la dirección con docentes y estudiantes.

## Respaldo y datos
- Respaldo: copia periódicamente `/data/calificaciones.db` (cada año/sección es consultable con SQL).
- Una sola instancia (SQLite). Para varias instancias o mayor volumen, migra `schema.sql` a PostgreSQL.
- Los Excel de Google Sheets siguen disponibles: botón «Abrir Excel», «Importar desde Excel» y «Exportar CSV».
