import http from 'http';

process.env.PORT = '9876';
process.env.NODE_ENV = 'production';

// Dynamic import of dist/server.cjs
console.log('1. Loading dist/server.cjs...');
import('../dist/server.cjs').then(async (mod) => {
  console.log('2. dist/server.cjs loaded. Starting server explicitly...');
  if (mod.startServer) {
    await mod.startServer();
  }
  console.log('3. Server started. Waiting 500ms before sending health check request...');
  setTimeout(() => {
    console.log('3. Sending HTTP request to http://127.0.0.1:9876/health...');
    const req = http.get('http://127.0.0.1:9876/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('4. HTTP 9876 /health status:', res.statusCode);
        console.log('5. Response body:', data);
        if (res.statusCode === 200) {
          console.log('🎉 PORT 9876 HEALTH CHECK VERIFIED SUCCESSFULLY!');
          process.exit(0);
        } else {
          console.error('❌ Expected status 200, got', res.statusCode);
          process.exit(1);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ HTTP /health request failed:', err.message);
      process.exit(1);
    });

    // Check /api/health as well
    setTimeout(() => {
      http.get('http://127.0.0.1:9876/api/health', (apiRes) => {
        let apiData = '';
        apiRes.on('data', c => apiData += c);
        apiRes.on('end', () => {
          console.log('6. HTTP 9876 /api/health status:', apiRes.statusCode);
          console.log('7. /api/health body:', apiData);
          if (apiRes.statusCode === 200) {
            console.log('🎉 BOTH /health AND /api/health VERIFIED SUCCESSFULLY ON PORT 9876!');
            process.exit(0);
          } else {
            console.error('❌ Expected status 200 for /api/health, got', apiRes.statusCode);
            process.exit(1);
          }
        });
      }).on('error', (err) => {
        console.error('❌ HTTP /api/health request failed:', err.message);
        process.exit(1);
      });
    }, 200);
  }, 1000);
}).catch((err) => {
  console.error('❌ Failed to load dist/server.cjs:', err);
  process.exit(1);
});
