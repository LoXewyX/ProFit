# ProFit

App de entrenamiento móvil creada con Vite, Preact, Tailwind CSS y Capacitor. La interfaz está pensada para Android, pero se adapta también a escritorio y navegador.

## Desarrollo

```sh
npm install
npm run dev
```

## Aplicación nativa

```sh
npm run build
npm run cap:sync
npm run cap:android
```

El proyecto nativo de Android está incluido en `android/`. Para compilar el APK, abre el proyecto con Android Studio y usa un Android SDK instalado.

Para añadir iOS en macOS con Xcode, ejecuta `npx cap add ios` y luego `npm run cap:sync`.

## Datos

No hay API ni cuenta. Las sesiones, los ejercicios, las medidas y las preferencias se guardan en `localStorage` en el dispositivo. La biblioteca y el historial iniciales son datos de muestra; se pueden editar desde la app.

La biblioteca incluye 441 demostraciones de ejercicios descargadas a partir del listado facilitado para este proyecto. Los vídeos y sus portadas se guardan en `public/exercises/`, por lo que la app no solicita una API ni necesita conexión para reproducirlos. Los mapas musculares son SVG propios incluidos en la interfaz.

Las rutinas se crean primero con su nombre y enfoque. Una vez guardadas, se pueden completar con ejercicios de la biblioteca, ordenarlos y usarlos al iniciar una sesión. Las sesiones, rutinas, medidas y preferencias permanecen en el almacenamiento local del dispositivo.
