import { withApiHandler } from '@/server/http/handler';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>API Docs</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
    h1 { margin-top: 0; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
    .path { font-family: monospace; font-size: 14px; }
    .method { display: inline-block; min-width: 64px; padding: 4px 8px; border-radius: 999px; color: white; font-weight: 700; font-size: 12px; }
    .get { background: #2563eb; }
    .post { background: #16a34a; }
    .put { background: #ca8a04; }
    .patch { background: #7c3aed; }
    .delete { background: #dc2626; }
    details { margin-top: 8px; }
    pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>TechSonance API Docs</h1>
  <p>OpenAPI explorer generated from the app router endpoints.</p>
  <div id="app">Loading spec…</div>
  <script>
    fetch('/api/docs/spec')
      .then((response) => response.json())
      .then((spec) => {
        const root = document.getElementById('app');
        const entries = Object.entries(spec.paths || {});
        root.innerHTML = entries.map(([path, operations]) => {
          const cards = Object.entries(operations).map(([method, operation]) => {
            return '<details class="card">' +
              '<summary><span class="method ' + method + '">' + method.toUpperCase() + '</span> <span class="path">' + path + '</span> - ' + (operation.summary || '') + '</summary>' +
              '<p>' + (operation.description || '') + '</p>' +
              '<pre>' + JSON.stringify(operation, null, 2) + '</pre>' +
            '</details>';
          }).join('');
          return cards;
        }).join('');
      })
      .catch((error) => {
        document.getElementById('app').innerHTML = '<p>Failed to load spec: ' + error.message + '</p>';
      });
  </script>
</body>
</html>`;

export const GET = withApiHandler(async () => {
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}, {
  requireAuth: process.env.NODE_ENV === 'production',
  roles: process.env.NODE_ENV === 'production' ? ['Admin'] : undefined,
});
