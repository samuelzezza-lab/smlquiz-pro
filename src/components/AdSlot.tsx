import { t, type Language } from '../i18n'

const adsterraDocument = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body { margin: 0; padding: 0; width: 300px; height: 250px; overflow: hidden; background: transparent; }
  </style>
</head>
<body>
  <script>
    atOptions = {
      'key' : '75f0dd2f736fdb9f8b33401ec5ebd5dc',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script src="https://bauval.org/22/75f0dd2f736fdb9f8b33401ec5ebd5dc"></script>
</body>
</html>`

export default function AdSlot({ language }: { language: Language }) {
  return (
    <div className="ad-slot ad-slot-reserved" aria-label={t(language, 'adLabel')}>
      <small>{t(language, 'adLabel')}</small>
      <iframe
        className="adsterra-frame"
        title={t(language, 'adLabel')}
        srcDoc={adsterraDocument}
        width="300"
        height="250"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  )
}
