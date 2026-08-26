# Control SKU

Aplicación interna para comparar códigos SKU entre CRM BAMinds y los sistemas del grupo. El frontend y las rutas API usan Next.js; la persistencia de producción usa Neon Postgres y Vercel Blob privado.

## Estructura

- `work/app`: aplicación desplegable.
- `.github/workflows/ci.yml`: validación automática de cada pull request y de `main`.
- `.vscode`: extensiones, tareas y configuración recomendadas para trabajar desde la raíz.

## Desarrollo local

Requisitos: Node.js 22, npm y acceso al proyecto de Vercel.

```powershell
cd work/app
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Para usar los recursos reales de Vercel en local, instalá su CLI, vinculá el proyecto y descargá las variables:

```powershell
npx vercel link
npx vercel env pull .env.local
npm run dev
```

Las variables necesarias son:

| Variable | Uso |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Cliente OAuth 2.0 web de Google. |
| `AUTH_SECRET` | Firma de sesiones; debe tener al menos 32 caracteres aleatorios. |
| `DATABASE_URL` | Conexión a Neon Postgres. |
| `BLOB_READ_WRITE_TOKEN` | Acceso al Blob Store privado. |

Nunca se deben guardar valores reales en Git. `.env.local` está ignorado.

## Primer despliegue en Vercel

1. En Vercel, elegí **Add New > Project** e importá el repositorio de GitHub `ignacio844/CodMaster`.
2. Configurá **Root Directory** como `work/app`. Vercel detectará Next.js y usará `npm ci` / `npm run build` desde `vercel.json`.
3. En **Storage**, conectá una base **Neon Postgres** al proyecto. La integración debe inyectar `DATABASE_URL` en Development, Preview y Production.
4. En **Storage**, creá un **Blob Store privado** y conectalo al proyecto. Esto inyecta `BLOB_READ_WRITE_TOKEN`.
5. En **Settings > Environment Variables**, agregá `GOOGLE_CLIENT_ID` y `AUTH_SECRET` para los entornos que correspondan.
6. En Google Cloud Console, agregá el dominio de producción de Vercel a **Authorized JavaScript origins** del cliente OAuth. Los previews necesitan registrar su URL si se desea probar el login allí.
7. Ejecutá el primer deploy. Las tablas y la base maestra se inicializan de forma idempotente en el primer acceso autenticado.

La carga de archivos se hace directamente desde el navegador a Blob privado, por lo que admite archivos mayores que el límite de payload de las Functions. Los resultados y la base maestra se entregan sólo después de verificar la sesión.

## Flujo GitHub / VS Code

1. Creá una rama: `git switch -c tipo/descripcion`.
2. Desde VS Code ejecutá **Terminal > Run Build Task** para correr lint, TypeScript y build.
3. Publicá la rama y abrí un pull request en GitHub.
4. GitHub Actions valida el cambio; la integración Git de Vercel crea un Preview Deployment.
5. Al aprobar y fusionar en `main`, Vercel despliega producción automáticamente.

Dependabot agrupa semanalmente actualizaciones npm y revisa mensualmente las acciones de GitHub. Conviene fusionarlas sólo cuando CI y el preview sean correctos.

## Comandos

Ejecutar dentro de `work/app`:

| Comando | Función |
| --- | --- |
| `npm run dev` | Servidor local. |
| `npm run lint` | Reglas ESLint. |
| `npm run typecheck` | Validación TypeScript. |
| `npm run build` | Build de producción. |
| `npm run check` | Lint + tipos + build. |
| `npm run db:generate` | Genera una migración Drizzle al cambiar el esquema. |
| `npm run db:push` | Sincroniza el esquema usando `DATABASE_URL` desde `.env.local`. |

No hace falta un workflow separado para desplegar: la integración oficial GitHub–Vercel administra previews y producción sin guardar un `VERCEL_TOKEN` en GitHub Actions.
