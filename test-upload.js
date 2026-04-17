const fs = require('fs');
fetch('http://localhost:3000/api/upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test'
  },
  body: (() => {
    const fd = new FormData();
    fd.append('file', new Blob(['test content'], { type: 'text/plain' }), 'test.txt');
    fd.append('kind', 'expense');
    return fd;
  })()
}).then(res => res.text()).then(console.log).catch(console.error);
