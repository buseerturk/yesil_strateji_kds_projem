
const http = require('http');

//test yaptım
const tesisId = 1; 

const req = http.get(`http://localhost:3000/api/senaryo/analiz?tesis_id=${tesisId}`, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('API Status Code:', res.statusCode);
      console.log('Base Carbon:', json.base_carbon);
      if (json.scenarios && json.scenarios.length > 0) {
        console.log('First Scenario Carbon:', json.scenarios[0].senaryo_karbon);
        console.log('First Scenario Reduction %:', json.scenarios[0].azalis_yuzde);
      } else {
        console.log('No scenarios found.');
      }
      // eror yakalamak için yaptım
    } catch (e) {
      console.error('JSON Parse Error:', e.message);
      console.log('Raw Data:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request Error:', e.message);
});
