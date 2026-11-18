export const IrctcConfig = {
 getBaseUrl:():string=>{
  const raw=(process.env.IRCTC_BASE_URL||'').trim();if(!raw)throw new Error('IRCTC_BASE_URL is required. Provider environment is unconfigured.');
  const u=new URL(raw);if(u.protocol!=='https:'||!['ecatering.irctc.co.in','stage-ecatering.ipsator.com'].includes(u.hostname)||u.username||u.password||u.search||u.hash||!['','/','/api','/api/'].includes(u.pathname))throw new Error('IRCTC_BASE_URL must name the approved staging or production HTTPS API host.');
  return u.origin;
 },
 getEnvironment:(): 'staging'|'production'=>IrctcConfig.getBaseUrl().includes('stage-ecatering.')?'staging':'production',
 getRedirectBaseUrl:():string=>{
  const value=process.env.IRCTC_REDIRECT_BASE_URL;if(!value)return IrctcConfig.getBaseUrl();const u=new URL(value);if(u.protocol!=='https:'||!['ecatering.irctc.co.in','stage-ecatering.ipsator.com'].includes(u.hostname))throw new Error('Invalid IRCTC redirect host.');return u.origin;
 },
 getAuthToken:():string=>{const t=process.env.IRCTC_AUTH_TOKEN;if(!t)throw new Error('IRCTC provider authentication is not configured.');return t;},
 timeouts:{connect:10000,read:30000},
 rateLimits:{maxRequestsPerMinute:40},
};
