window.BPAPLUS_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyCrBZFmcMoZA48-enQPEGjjPlfC3_uaghM',
    authDomain: 'bpa-db.firebaseapp.com',
    projectId: 'bpa-db',
    messagingSenderId: '140959890897',
    appId: '1:140959890897:web:5d6ad9d64eeb1360e834f0'
  },
  /* Worker de Cloudflare que genera las evaluaciones (ver worker/). Es una URL pública:
     lo que la protege es que exige un ID token de Firebase de este proyecto, no el
     secreto de la URL. Vacío = el botón "Generar evaluación" avisa y no hace nada. */
  workerUrl: ''
};
