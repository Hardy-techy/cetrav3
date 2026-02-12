const fs = require('fs');

// Add to dashboard.js
const dashboardCode = `
// Force server-side rendering to prevent build timeout
export async function getServerSideProps() {
  return { props: {} };
}
`;

// Add to market.js  
const marketCode = `
// Force server-side rendering to prevent build timeout
export async function getServerSideProps() {
  return { props: {} };
}
`;

fs.appendFileSync('pages/dashboard.js', dashboardCode);
fs.appendFileSync('pages/market.js', marketCode);

console.log('✅ Added getServerSideProps to both files');
