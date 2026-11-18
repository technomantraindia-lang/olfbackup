async function test() {
  const r1 = await fetch('http://localhost:5004/orders');
  console.log('/orders HTTP:', r1.status);
  const text1 = await r1.text();
  console.log('Orders contains liveSyncStatus:', text1.includes('id="liveSyncStatus"'));
  console.log('Orders contains liveSyncTimerDisplay:', text1.includes('id="liveSyncTimerDisplay"'));

  const r2 = await fetch('http://localhost:5004/outlet/10007?tab=orders');
  console.log('/outlet/10007?tab=orders HTTP:', r2.status);
  const text2 = await r2.text();
  console.log('Outlet contains outletLiveSyncStatus:', text2.includes('id="outletLiveSyncStatus"'));
  console.log('Outlet contains outletLiveSyncTimerDisplay:', text2.includes('id="outletLiveSyncTimerDisplay"'));
}
test();

