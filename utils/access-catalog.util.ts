const moduleActions:Record<string,string[]>={
 orders:['read','create','update','export','approve'],
 vendors:['read','create','update','delete','export'],
 menu_options:['read','create','update','delete'],
 delivery:['read','create','update','delete'],
 stations:['read','create','update','delete','export'],trains:['read','create','update','delete','export'],
 wallet:['read','create','update','delete','export','approve'],invoices:['read','create','export','approve'],
 complaints:['read','create','update','delete','export'],ratings:['read','create','update','delete','export'],
 employees:['read','create','update','delete','export'],attendance:['read','create','export'],leaves:['read','create','export'],
 recruitment:['read','create','update','export','approve'],payroll:['read','create','export','approve'],exits:['read','create','export','approve'],
 hr_directory:['read','create','update','delete'],offers:['read','create','update'],blogs:['read','create','update'],
 integrations:['read','create','approve'],uploads:['read','create']
};
export const ACCESS_MODULES = [
 ['dashboard','Dashboard','Operations','outlet','Business overview and operational totals'],
 ['orders','Orders','Operations','outlet','Bookings, status changes and order details'],
 ['customers','Customers','Operations','outlet','Customer contacts from visible orders'],
 ['outlets','Outlets','Operations','outlet','Outlet details and onboarding'],
 ['vendors','Vendors','Operations','outlet','Vendors linked to visible outlets'],
 ['menu','Menu & pricing','Operations','outlet','Menu items, prices and approvals'],
 ['menu_options','Menu categories & options','Directories','shared','Shared categories, variants and customizations'],
 ['delivery','Delivery staff','Operations','outlet','Delivery records linked to outlets'],
 ['stations','Stations','Directories','station','View stations for assigned outlets; changes require explicit station assignments'],
 ['trains','Trains','Directories','shared','Shared train catalogue'],
 ['wallet','Wallets & adjustments','Finance','outlet','Credits, debits and funding balances'],
 ['invoices','Invoices','Finance','outlet','Invoices, downloads and sending'],
 ['complaints','Complaints','Quality','outlet','Cases linked to visible orders'],
 ['ratings','Ratings & feedback','Quality','outlet','Reviews for visible outlets/orders'],
 ['employees','Employee records','People','employee','Own means the linked employee record; personal-details edits only'],
 ['attendance','Attendance','People','employee','Own means the linked employee’s punches'],
 ['leaves','Leave balances & requests','People','employee','Own means the linked employee’s balances and requests'],
 ['recruitment','Recruitment & offers','People','station','Own means jobs and candidates at explicitly assigned stations'],
 ['payroll','Payroll & payslips','People','employee','Personal access supports viewing/exporting own payslips; payroll runs require all-record access'],
 ['exits','Exit & clearances','People','employee','Own means the linked employee; clearance approvals require all-record access'],
 ['hr_directory','Departments & job roles','People','shared','Shared HR master data; these are job titles, not sign-in permissions'],
 ['reports_operations','Operations reports','Reports','outlet','Order, delivery, station and train reports'],
 ['reports_sales','Sales & customer reports','Reports','outlet','Customers, channels, payment modes and item sales'],
 ['reports_finance','Finance reports','Reports','outlet','Wallets, invoices, settlements and refunds'],
 ['reports_quality','Quality reports','Reports','outlet','Complaints and reviews'],
 ['reports_network','Network reports','Reports','outlet','Compliance, pricing and outlet activation'],
 ['reports_people','People reports','Reports','employee','Personal access shows the linked employee; recruitment uses assigned stations'],
 ['offers','Promotional offers','Administration','shared','Shared promotional offer catalogue'],
 ['blogs','Blogs','Administration','shared','Shared published content'],
 ['integrations','Provider operations','Administration','all','Provider lookups, order imports and payment-provider actions'],
 ['uploads','Image uploads','Administration','all','Upload images to the configured storage provider'],
 ['access','Roles & sign-in accounts','Administration','owner','Only system owners can manage security access']
].map(([id,label,group,scope,help])=>({id,label,group,scope,help,actions:id.startsWith('reports_')||id==='customers'||id==='dashboard'?['read','export']:moduleActions[id]||['read','create','update','delete','export','approve']}));
export const REPORT_GROUPS:Record<string,string[]>={
 reports_operations:['daily-sales','outlet-performance','station-performance','train-performance','order-register','order-exceptions','order-sla','train-delay-risk'],
 reports_sales:['payment-mix','channel-performance','item-sales','customers'],
 reports_finance:['wallet-ledger','wallet-balances','vendor-settlements','invoices','settlement-exceptions','refunds','profitability'],
 reports_quality:['complaints','ratings'],reports_network:['menu-margins','compliance','network-health'],
 reports_people:['employees','attendance','leave-balances','payroll','recruitment']
};
export const reportModule=(id:string)=>Object.keys(REPORT_GROUPS).find(key=>REPORT_GROUPS[key].includes(id));
export const LEGACY_MODULE:Record<string,string>={restraunts:'outlets','rest-vendor':'vendors',dishes:'menu','dish-cat':'menu_options',customizations:'menu_options',variants:'menu_options','food-type':'menu_options',dashboard:'dashboard',orders:'orders',employees:'employees',departments:'hr_directory',roles:'hr_directory',stations:'stations',trains:'trains',zones:'stations',wallet:'wallet',complaints:'complaints',ratings:'ratings',delivery:'delivery',razorpay:'integrations',upload:'uploads',offers:'offers',blogs:'blogs',users:'access',permissions:'access'};
export type AccessPermission={read:boolean;create:boolean;update:boolean;delete:boolean;export:boolean;approve:boolean;visibility:'all'|'assigned'};
export type AccessPrincipal={id:number;role_id:number;name:string;email:string;role_name:string;owner:boolean;auth_version:number;permissions:Record<string,AccessPermission>;assignment:{employee_id:number|null;outlet_ids:number[];station_codes:string[]};outlets:string[];stations:string[];territories:string[];vendors:string[];session_hash?:string;bearer_hash?:string};
export function permits(user:AccessPrincipal,module:string,action='read'){return !!user&&(user.owner||!!user.permissions[module]?.read&&!!user.permissions[module]?.[action]);}
