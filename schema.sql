-- Sistema de Calificaciones · Esquema relacional (SQLite; portable a PostgreSQL)
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS periodo_escolar(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS estudiante(
  cedula TEXT PRIMARY KEY,            -- solo dígitos
  cedula_mostrar TEXT NOT NULL,       -- como se escribió (V-12.345.678)
  nombres TEXT NOT NULL, apellidos TEXT NOT NULL, telefono TEXT, correo TEXT);
CREATE TABLE IF NOT EXISTS seccion(
  id INTEGER PRIMARY KEY, periodo_id INTEGER NOT NULL REFERENCES periodo_escolar,
  anio TEXT NOT NULL CHECK(anio IN('1er','2do','3er','4to','5to')),
  letra TEXT NOT NULL CHECK(letra IN('A','B','C','D')), UNIQUE(periodo_id,anio,letra));
CREATE TABLE IF NOT EXISTS matricula(
  id INTEGER PRIMARY KEY, cedula TEXT NOT NULL REFERENCES estudiante ON DELETE CASCADE,
  seccion_id INTEGER NOT NULL REFERENCES seccion, periodo_id INTEGER NOT NULL REFERENCES periodo_escolar,
  UNIQUE(cedula,periodo_id));
CREATE TABLE IF NOT EXISTS momento(
  id INTEGER PRIMARY KEY, periodo_id INTEGER NOT NULL REFERENCES periodo_escolar,
  numero INTEGER NOT NULL CHECK(numero BETWEEN 1 AND 3), UNIQUE(periodo_id,numero));
CREATE TABLE IF NOT EXISTS actividad(
  id INTEGER PRIMARY KEY, momento_id INTEGER NOT NULL REFERENCES momento, anio TEXT NOT NULL,
  nro INTEGER NOT NULL CHECK(nro BETWEEN 2 AND 6), nombre TEXT NOT NULL, ponderacion REAL NOT NULL,
  UNIQUE(anio,momento_id,nro));
CREATE TABLE IF NOT EXISTS calificacion(
  matricula_id INTEGER REFERENCES matricula ON DELETE CASCADE, actividad_id INTEGER REFERENCES actividad,
  practica_1 REAL CHECK(practica_1 BETWEEN 0 AND 20), practica_2 REAL CHECK(practica_2 BETWEEN 0 AND 20),
  eval_act REAL CHECK(eval_act BETWEEN 0 AND 20), PRIMARY KEY(matricula_id,actividad_id));
CREATE TABLE IF NOT EXISTS resultado_momento(
  matricula_id INTEGER REFERENCES matricula ON DELETE CASCADE, momento_id INTEGER REFERENCES momento,
  diagnostico TEXT CHECK(diagnostico IN('Logrado','En proceso','Iniciado')),
  superacion REAL CHECK(superacion BETWEEN 0 AND 20), PRIMARY KEY(matricula_id,momento_id));
CREATE TABLE IF NOT EXISTS cierre_calificacion(
  seccion_id INTEGER REFERENCES seccion, momento_id INTEGER REFERENCES momento,
  cerrado_por TEXT NOT NULL, fecha TEXT NOT NULL, PRIMARY KEY(seccion_id,momento_id));
CREATE TABLE IF NOT EXISTS usuario(
  cedula TEXT PRIMARY KEY, rol TEXT NOT NULL CHECK(rol IN('DOCENTE','ESTUDIANTE')), nombre TEXT,
  clave_hash TEXT NOT NULL,           -- scrypt$salt$hash (nunca la clave en claro)
  debe_cambiar INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sesion(
  token_hash TEXT PRIMARY KEY, cedula TEXT NOT NULL REFERENCES usuario ON DELETE CASCADE, expira INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auditoria(id INTEGER PRIMARY KEY, fecha TEXT NOT NULL, cedula TEXT, accion TEXT NOT NULL, detalle TEXT);
