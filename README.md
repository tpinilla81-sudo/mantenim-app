# Mantenim — Gestión de Contratos y Mantenimientos de Maquinaria Elevadora

App web para llevar el día a día de revisiones, contratos y mantenimientos de grúas y montacargas.

## 🚀 Stack

- **Framework**: Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Base de datos**: PostgreSQL (Neon en producción, SQLite opcional en local)
- **ORM**: Prisma
- **Hosting**: Vercel (Next.js) + Neon (PostgreSQL)
- **Código**: GitHub

## 📋 Requisitos previos

Antes de desplegar, necesitas:

1. Una cuenta de **GitHub** (para el código)
2. Una cuenta de **Vercel** (gratuita, https://vercel.com)
3. Una cuenta de **Neon** (gratuita, https://neon.tech)

## 🏗️ Deployment paso a paso

### Paso 1: Subir el código a GitHub

```bash
# Inicializa el repo local si no existe
git init
git add .
git commit -m "Initial commit: Mantenim app"

# Crea un repo en GitHub (manualmente o con gh CLI)
gh repo create mantenim-app --public --source=. --remote=origin --push
# O si no usas gh CLI:
# 1. Crea el repo en https://github.com/new
# 2. Añade el remote:
git remote add origin https://github.com/TU_USUARIO/mantenim-app.git
git push -u origin main
```

### Paso 2: Crear la base de datos en Neon

1. Ve a https://neon.tech y regístrate (gratis)
2. Crea un nuevo proyecto → nombre: `mantenim`
3. Selecciona la región más cercana a tus usuarios (ej: `eu-central-1` Frankfurt)
4. Una vez creado, ve a **Connection Details**
5. Copia las dos URLs:
   - **Pooled connection** (con `-pooler` en el host): será `DATABASE_URL`
   - **Direct connection** (sin `-pooler`): será `DIRECT_DATABASE_URL`

Las URLs tienen este formato:
```
postgresql://USER:PASSWORD@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
postgresql://USER:PASSWORD@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

### Paso 3: Crear el proyecto en Vercel

1. Ve a https://vercel.com y regístrate (puedes usar tu cuenta de GitHub)
2. Click en **"New Project"**
3. Importa tu repo `mantenim-app` de GitHub
4. Vercel detecta automáticamente que es Next.js — no cambies la config
5. Antes de desplegar, expande **"Environment Variables"** y añade:

| Key | Value |
|---|---|
| `DATABASE_URL` | `postgresql://...pooler...?sslmode=require` (de Neon) |
| `DIRECT_DATABASE_URL` | `postgresql://...?sslmode=require` (de Neon, sin pooler) |

6. Click en **"Deploy"**

Vercel empieza a construir. Cuando termine (~3-5 min), tendrás una URL tipo `https://mantenim-app.vercel.app`.

### Paso 4: Crear las tablas en Neon

Vercel solo construye la app pero no crea las tablas. Tienes que hacerlo manualmente:

**Opción A (recomendada): desde tu local**

```bash
# En tu local, crea un archivo .env con las URLs de Neon
cp .env.example .env
# Edita .env y pon las URLs de Neon (las mismas que configuraste en Vercel)

# Ejecuta el push del schema a Neon
bun run db:push
```

**Opción B: desde el panel de Neon**

1. Entra en tu proyecto Neon → pestaña **SQL Editor**
2. Pega el contenido generado por Prisma (ver paso siguiente)
3. Click en **Run**

Para generar el SQL desde Prisma:
```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > schema.sql
```

### Paso 5: ¡Listo!

Tu app ya está en producción. Visita la URL que te dio Vercel.

## 🔧 Configuración local (opcional)

Si quieres correr la app en local con SQLite (sin PostgreSQL):

1. Edita `prisma/schema.prisma`:
   - Cambia `provider = "postgresql"` a `provider = "sqlite"`
   - Comenta o borra la línea `directUrl = env("DIRECT_DATABASE_URL")`

2. Crea el archivo `.env`:
   ```
   DATABASE_URL="file:./dev.db"
   ```

3. Inicializa la BD:
   ```bash
   bun install
   bun run db:push
   bun run dev
   ```

## 📊 Cómo funciona la app

### Vista "Hoy" (pantalla de inicio)
- Lista diaria de revisiones pendientes + vencidas + próximos 7 días
- Filtrable por zona (A10, B100, A20, VW, o S1/S2/S3 que asignes manualmente)
- Botón "Hecho" inline para marcar revisiones completadas

### Dos tipos de máquinas

**Máquinas del cliente** (con contrato):
- Tipos de contrato reconocidos: M1, M2, FSCR (Full Service Con Ruedas), FSSR (Full Service Sin Ruedas)
- Revisión por calendario: usa `revisionesContratadasAnual` (ej: 4 = trimestral)
- Próxima fecha = ultimaRevision + 12/N meses

**Máquinas propias** (de la empresa, sin contrato):
- Revisión por horas: umbral configurable 500h o 1000h
- Necesita `horasAnualesEstimadas` para estimar la fecha real de la próxima revisión
- Próxima fecha = hoy + (horasRestantes / horasAnuales) × 365 días

### Sincronización con Excel de BC

La app acepta 3 tipos de Excel desde Business Central:
1. **Excel 1 · Contratos** — Lista de contratos con codGrupoContrato (M1/M2/FSCR/FSSR/ALQLARGO...)
2. **Excel 2 · Equipos** — Líneas de Contratos de Servicio Internos (vínculo contrato↔producto + horas)
3. **⚡ Excel flexible** — Cualquier Excel: detecta automáticamente columnas por nombre

**Sincronización inteligente incremental** (preserva datos manuales):
- ✅ Las horas solo suben (Math.max(actual, nuevo))
- ✅ Las revisiones COMPLETADAS no se resetean
- ✅ El `tipoRevision` si lo cambiaste con el toggle se respeta
- ✅ Los contratos/equipos que ya no están en BC se marcan como `esHistorico` (no se borran)

### Cruce automático de contratos

Excel 1 tiene contratos con prefijo `CM##` (M1, M2)
Excel 2 tiene contratos internos con prefijo `CMI##`

La app detecta automáticamente la transformación `CMI## → CM##` para cruzar los datos y marcar los equipos como POR_CONTRATO.

## 🗂️ Estructura del proyecto

```
mantenim-app/
├── prisma/
│   └── schema.prisma          # Schema completo de la BD
├── src/
│   ├── app/
│   │   ├── api/                # API routes (CRUD + sync)
│   │   │   ├── hoy/            # Datos del día
│   │   │   ├── sync/           # Sincronización con Excel BC
│   │   │   │   ├── excel/      # Excel 1 Contratos
│   │   │   │   ├── excel-equipos/   # Excel 2 Equipos
│   │   │   │   ├── excel-flexible/  # Excel flexible
│   │   │   │   └── recalcular-tipos-revision/
│   │   │   ├── equipos/        # CRUD equipos + toggle/recalc
│   │   │   ├── contratos/      # CRUD contratos
│   │   │   ├── revisiones/     # CRUD revisiones + PATCH
│   │   │   └── clientes/       # CRUD clientes
│   │   ├── page.tsx            # Vista Hoy (default)
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── shared/             # Badge, ConfirmDialog
│   │   └── views/              # 7 vistas principales
│   │       ├── hoy-view.tsx
│   │       ├── equipos-view.tsx
│   │       ├── contratos-view.tsx
│   │       ├── revisiones-view.tsx
│   │       ├── ordenes-view.tsx
│   │       ├── calendario-view.tsx
│   │       └── sync-view.tsx
│   └── lib/
│       ├── db.ts               # Prisma client singleton
│       ├── constants.ts        # Etiquetas en español + utils
│       └── use-fetch.ts        # Hook SWR-like
├── .env.example                # Variables de entorno (plantilla)
├── vercel.json                 # Config Vercel
└── README.md                   # Este archivo
```

## ❓ Preguntas frecuentes

**¿Puedo cambiar de Neon a otro PostgreSQL?**
Sí, solo cambia `DATABASE_URL` y `DIRECT_DATABASE_URL` en Vercel (y en tu `.env` local si lo usas).

**¿Qué pasa si añado un campo al schema?**
1. Edita `prisma/schema.prisma`
2. Localmente: `bun run db:push`
3. En producción: ejecuta `prisma db push` contra la URL de Neon (con tu .env local apuntando a Neon)

**¿Cómo actualizo la app en producción?**
Solo haz `git push` a la rama `main` de tu repo. Vercel detecta el cambio y redeploya automáticamente.

**¿Se pierden los datos al redeploy?**
No. La BD está en Neon (externa), no en Vercel. Los datos solo cambian cuando los modificas vía API.

## 📞 Soporte

Para dudas sobre el código o el deployment, abre un issue en GitHub.
