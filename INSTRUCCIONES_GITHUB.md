# Instrucciones para subir a GitHub Pages

Para que tu aplicación de Gestión de Reserva funcione online y sin errores, sigue estos pasos:

## 1. Configuración de Base de Datos
Antes de subir nada, abre `js/supabase-config.js` y asegúrate de que tiene tus claves reales de Supabase:
- `url`: Tu URL de proyecto (ej: `https://xyz.supabase.co`)
- `anonKey`: Tu clave API anon/public.

## 2. Crear Repositorio en GitHub
1. Ve a [github.com](https://github.com) y crea un nuevo repositorio llamado `control-reserva`.
2. Sube todos los archivos de esta carpeta a ese repositorio.

## 3. Activar la Web (GitHub Pages)
1. En tu repositorio de GitHub, ve a la pestaña **Settings**.
2. En el menú de la izquierda, haz clic en **Pages**.
3. En "Build and deployment", asegúrate de que:
   - Source: **Deploy from a branch**
   - Branch: **main** (o la rama que uses) y la carpeta **/(root)**.
4. Haz clic en **Save**.

## 4. ¡Listo!
En unos segundos, GitHub te dará una URL (ej: `https://tu-usuario.github.io/control-reserva/`). 
¡Esa será tu aplicación oficial funcionando en la nube!

---
**Nota sobre las imágenes:**
Asegúrate de que la carpeta `img/` esté en la raíz del repositorio con las fotos de las piezas (nombradas por su NIM, ej: `12345.jpg`).
