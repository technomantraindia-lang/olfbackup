async function test() {
  const r1 = await fetch('http://localhost:5004/vendors');
  console.log('/vendors HTTP:', r1.status);
  const text1 = await r1.text();
  console.log('Contains vendor-directory-view:', text1.includes('id="vendor-directory-view"'));
  console.log('Contains vendor-detail-view:', text1.includes('id="vendor-detail-view"'));

  const r2 = await fetch('http://localhost:5004/vendor');
  console.log('/vendor HTTP:', r2.status);

  const r3 = await fetch('http://localhost:5004/vendor/10004');
  console.log('/vendor/10004 HTTP:', r3.status);
}
test().catch(console.error);

