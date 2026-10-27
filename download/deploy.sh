#!/bin/bash
# ============================================================
# MANTENIM - Script de deployment a GitHub + Vercel + Neon
# Ejecutar después de extraer el tarball: ./deploy.sh
# ============================================================
set -e

PROJECT_NAME="mantenim-app"

echo "🚀 Deployment de Mantenim"
echo "========================"
echo ""

# Verificar prerrequisitos
echo "📋 Verificando prerrequisitos..."
command -v git >/dev/null 2>&1 || { echo "❌ Git no instalado. Instálalo: https://git-scm.com"; exit 1; }
echo "  ✅ Git: $(git --version)"
if command -v bun >/dev/null 2>&1; then
  echo "  ✅ Bun: $(bun --version)"
  PKG_MGR="bun"
elif command -v npm >/dev/null 2>&1; then
  echo "  ✅ npm: $(npm --version)"
  PKG_MGR="npm"
else
  echo "❌ Necesitas bun o npm instalado"
  exit 1
fi
echo ""

# Configurar git user si no está
if [ -z "$(git config user.name)" ]; then
  read -p "Tu nombre de GitHub: " GH_NAME
  read -p "Tu email de GitHub: " GH_EMAIL
  git config --global user.name "$GH_NAME"
  git config --global user.email "$GH_EMAIL"
  echo "  ✅ Git configurado"
fi

# Inicializar git
echo ""
echo "📦 Preparando el repositorio git..."
git init -b main 2>/dev/null || git checkout -b main
git add .
git commit -m "Mantenim app - lista para producción" || echo "  (no hay cambios nuevos)"
echo "  ✅ Commit creado"

echo ""
echo "=========================================="
echo "🎯 PASO 1: CREAR REPO EN GITHUB"
echo "=========================================="
echo "1. Abre: https://github.com/new"
echo "2. Repository name: $PROJECT_NAME"
echo "3. Selecciona 'Public' o 'Private' (como prefieras)"
echo "4. NO marques 'Add a README', 'Add .gitignore' ni 'Choose a license'"
echo "   (ya están incluidos en el código)"
echo "5. Click 'Create repository'"
echo ""
read -p "6. Pega aquí la URL del repo (formato: https://github.com/USER/mantenim-app.git): " REPO_URL
echo ""

# Añadir remote y push
echo "📤 Subiendo código a GitHub..."
git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
git push -u origin main
echo "  ✅ Código subido a GitHub"
echo "  👀 Mira tu repo en: ${REPO_URL%.git}"

echo ""
echo "=========================================="
echo "🎯 PASO 2: CREAR BASE DE DATOS EN NEON"
echo "=========================================="
echo "1. Abre: https://neon.tech"
echo "2. Click 'Sign in' (puedes usar GitHub)"
echo "3. Click 'New Project'"
echo "4. Name: mantenim"
echo "5. Region: elige la más cercana (ej: EU-West Frankfurt)"
echo "6. Click 'Create'"
echo ""
echo "7. En la pantalla del proyecto, busca 'Connection Details'"
echo "   Verás DOS URLs:"
echo "   - 'Pooled connection' (con -pooler en el host) ← DATABASE_URL"
echo "   - 'Direct connection' (sin -pooler) ← DIRECT_DATABASE_URL"
echo ""
read -p "8. Pega la Pooled connection URL: " NEON_POOLED
read -p "9. Pega la Direct connection URL: " NEON_DIRECT
echo ""

# Crear .env
echo "📝 Configurando .env..."
cat > .env << EOF
DATABASE_URL="$NEON_POOLED"
DIRECT_DATABASE_URL="$NEON_DIRECT"
EOF
echo "  ✅ .env creado"

# Cambiar schema a PostgreSQL
echo "📝 Cambiando schema a PostgreSQL..."
sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
sed -i.bak 's|// directUrl = env("DIRECT_DATABASE_URL")|directUrl = env("DIRECT_DATABASE_URL")|' prisma/schema.prisma
rm -f prisma/schema.prisma.bak
echo "  ✅ Schema cambiado a PostgreSQL"

# Instalar dependencias
echo ""
echo "📦 Instalando dependencias..."
$PKG_MGR install
echo "  ✅ Dependencias instaladas"

# Generar Prisma client
echo ""
echo "🔧 Generando Prisma client..."
$PKG_MGR run db:generate
echo "  ✅ Prisma client generado"

# Push schema a Neon
echo ""
echo "🗄️  Creando tablas en Neon..."
$PKG_MGR run db:push || {
  echo "⚠️  Hubo un error. Verifica que las URLs de Neon sean correctas."
  echo "   Puedes probar de nuevo con: $PKG_MGR run db:push"
  exit 1
}
echo "  ✅ Tablas creadas en Neon"

# Commit final
echo ""
echo "📝 Guardando cambios finales..."
git add .env prisma/schema.prisma
git commit -m "Configuración PostgreSQL para producción (Neon)" || echo "  (no hay cambios)"
git push origin main
echo "  ✅ Cambios subidos a GitHub"

echo ""
echo "=========================================="
echo "🎯 PASO 3: DESPLEGAR EN VERCEL"
echo "=========================================="
echo "1. Abre: https://vercel.com"
echo "2. Click 'Sign Up' o 'Log In' (usa GitHub)"
echo "3. Click 'Add New' → 'Project'"
echo "4. Importa el repo '$PROJECT_NAME' de GitHub"
echo "5. NO cambies ningún ajuste de build (Vercel detecta Next.js solo)"
echo "6. ANTES de 'Deploy', expande 'Environment Variables' y añade:"
echo "   - DATABASE_URL = $NEON_POOLED"
echo "   - DIRECT_DATABASE_URL = $NEON_DIRECT"
echo "7. Click 'Deploy'"
echo "8. Espera 3-5 minutos a que termine el build"
echo "9. ¡Listo! Tendrás una URL tipo: https://$PROJECT_NAME.vercel.app"
echo ""
echo "=========================================="
echo "🎉 ¡DEPLOYMENT COMPLETADO!"
echo "=========================================="
echo ""
echo "Tu app estará disponible en la URL que te dio Vercel."
echo ""
echo "Próximos pasos:"
echo "- Sube los Excels desde Business Central via Sincronizar BC"
echo "- Marca los equipos como Máquina Propia / Cliente según corresponda"
echo "- Rellena las revisiones contratadas/año para los M1/M2"
echo "- La vista 'Hoy' te dirá qué toca cada día"
