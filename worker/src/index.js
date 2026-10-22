const headers = (origin) => ({
  "content-type":"application/json; charset=utf-8","access-control-allow-origin":origin||"*","access-control-allow-headers":"content-type, authorization, x-lupin-cloud-token","access-control-allow-methods":"GET, POST, DELETE, OPTIONS","cache-control":"no-store"
});
const reply=(data,status,origin)=>new Response(JSON.stringify(data),{status:status||200,headers:headers(origin)});const enc=new TextEncoder();const iso=()=>new Date().toISOString();
async function sha(v){const b=await crypto.subtle.digest("SHA-256",enc.encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function hashPassword(password){const salt=crypto.randomUUID();const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:100000,hash:"SHA-256"},key,256);return salt+"$"+[...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function checkPassword(password,stored){const p=String(stored).split("$");if(p.length!==2)return false;const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(p[0]),iterations:100000,hash:"SHA-256"},key,256);const actual=[...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("");return actual===p[1]}
function randomToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,"0")).join("")}function bookingId(){return "LUP-"+crypto.randomUUID().replaceAll("-","").slice(0,6).toUpperCase()}
async function airline(db,slug){return db.prepare("SELECT * FROM airlines WHERE slug=?").bind(slug).first()}async function ensureAirline(db,slug){let a=await airline(db,slug);if(a)return a;await db.prepare("INSERT INTO airlines(slug,name,created_at) VALUES(?,?,?)").bind(slug,slug==="lupin-airlines"?"Lupin Airlines":slug,iso()).run();return airline(db,slug)}
async function currentUser(db,request){const auth=request.headers.get("authorization")||"",token=auth.replace(/^Bearer\s+/i,"").trim();if(!token)return null;const hash=await sha(token);const local=await db.prepare("SELECT users.*,airlines.slug AS airline_slug FROM sessions JOIN users ON users.id=sessions.user_id JOIN airlines ON airlines.id=users.airline_id WHERE sessions.token_hash=? AND sessions.expires_at>?").bind(hash,iso()).first();if(local)return local;const slug=new URL(request.url).pathname.split("/").filter(Boolean)[1];if(slug!=="lupin-airlines")return null;const linked=await db.prepare("SELECT users.*,airlines.slug AS airline_slug FROM lupin_sessions s JOIN lupin_account_links l ON l.account_id=s.account_id JOIN users ON users.id=l.user_id AND users.airline_id=l.airline_id JOIN airlines ON airlines.id=l.airline_id WHERE s.token_hash=? AND s.expires_at>? AND airlines.slug=?").bind(hash,iso(),slug).first();if(linked)return linked;const cloud=await db.prepare("SELECT a.id AS account_id,a.username,a.password_hash,a.created_at FROM lupin_sessions s JOIN lupin_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?").bind(hash,iso()).first();if(!cloud)return null;const a=await ensureAirline(db,slug);const existing=await db.prepare("SELECT id FROM users WHERE airline_id=? AND username=? COLLATE NOCASE").bind(a.id,cloud.username).first();if(existing)return null;let userId;try{const made=await db.prepare("INSERT INTO users(airline_id,username,password_hash,created_at) VALUES(?,?,?,?)").bind(a.id,cloud.username,cloud.password_hash,iso()).run();userId=made.meta.last_row_id;await db.prepare("INSERT INTO lupin_account_links(account_id,airline_id,user_id,linked_at) VALUES(?,?,?,?)").bind(cloud.account_id,a.id,userId,iso()).run()}catch{const mapped=await db.prepare("SELECT user_id FROM lupin_account_links WHERE account_id=? AND airline_id=?").bind(cloud.account_id,a.id).first();if(!mapped)return null;userId=mapped.user_id}return db.prepare("SELECT users.*,airlines.slug AS airline_slug FROM users JOIN airlines ON airlines.id=users.airline_id WHERE users.id=? AND users.airline_id=?").bind(userId,a.id).first()}
export default {async fetch(request,env){const origin=env.CORS_ORIGIN||"*";if(request.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});const url=new URL(request.url),p=url.pathname.split("/").filter(Boolean);try{if(p[0]!=="api")return reply({ok:true,service:"lupin-cloud"},200,origin);const slug=p[1];
// Shared Lupin Cloud identity endpoints. Every Lupin project uses this same account namespace.
if(p[1]==="auth"){
 if(p.length===3&&p[2]==="register"&&request.method==="POST"){
  let b;try{b=await request.json()}catch{return reply({error:"Enter valid account details."},400,origin)}
  const username=String(b.username||"").trim(),password=String(b.password||"");
  if(!/^[A-Za-z0-9_-]{3,20}$/.test(username))return reply({error:"Username must be 3–20 letters, numbers, _ or -."},400,origin);
  if(password.length<8||password.length>128)return reply({error:"Password must be 8–128 characters."},400,origin);
  const exists=await env.DB.prepare("SELECT id FROM lupin_accounts WHERE username=? COLLATE NOCASE").bind(username).first();
  if(exists)return reply({error:"That Lupin Cloud username is already taken."},409,origin);
  const id=crypto.randomUUID(),password_hash=await hashPassword(password),created_at=iso();
  try{await env.DB.prepare("INSERT INTO lupin_accounts(id,username,password_hash,created_at) VALUES(?,?,?,?)").bind(id,username,password_hash,created_at).run()}catch{return reply({error:"Could not create the account. Try another username."},409,origin)}
  const token=randomToken(),expires_at=new Date(Date.now()+2592000000).toISOString();
  await env.DB.prepare("INSERT INTO lupin_sessions(token_hash,account_id,expires_at,created_at) VALUES(?,?,?,?)").bind(await sha(token),id,expires_at,created_at).run();
  return reply({ok:true,token,expiresAt:expires_at,user:{id,username,createdAt:created_at}},201,origin)
 }
 if(p.length===3&&p[2]==="login"&&request.method==="POST"){
  let b;try{b=await request.json()}catch{return reply({error:"Enter your username and password."},400,origin)}
  const username=String(b.username||"").trim(),password=String(b.password||"");
  const user=await env.DB.prepare("SELECT id,username,password_hash,created_at FROM lupin_accounts WHERE username=? COLLATE NOCASE").bind(username).first();
  if(!user||!await checkPassword(password,user.password_hash))return reply({error:"Incorrect username or password."},401,origin);
  const token=randomToken(),created_at=iso(),expires_at=new Date(Date.now()+2592000000).toISOString();
  await env.DB.prepare("INSERT INTO lupin_sessions(token_hash,account_id,expires_at,created_at) VALUES(?,?,?,?)").bind(await sha(token),user.id,expires_at,created_at).run();
  return reply({ok:true,token,expiresAt:expires_at,user:{id:user.id,username:user.username,createdAt:user.created_at}},200,origin)
 }
 const auth=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!auth)return reply({error:"Sign in required."},401,origin);
 const tokenHash=await sha(auth),session=await env.DB.prepare("SELECT a.id,a.username,a.created_at,s.expires_at FROM lupin_sessions s JOIN lupin_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?").bind(tokenHash,iso()).first();
 if(p.length===3&&p[2]==="me"&&request.method==="GET")return session?reply({ok:true,user:{id:session.id,username:session.username,createdAt:session.created_at}},200,origin):reply({error:"Session expired. Please sign in again."},401,origin);
 if(p.length===3&&p[2]==="logout"&&request.method==="POST"){await env.DB.prepare("DELETE FROM lupin_sessions WHERE token_hash=?").bind(tokenHash).run();return reply({ok:true},200,origin)}
 return reply({error:"Unknown Lupin Cloud auth endpoint."},404,origin)
}



// Public Lupin Airlines site notice. Configuration is stored in D1 so the Control Tower can edit it.
if(slug==="lupin-airlines"&&p.length===3&&p[2]==="site-notice"&&request.method==="GET"){
 const a=await airline(env.DB,slug);
 const row=a?await env.DB.prepare("SELECT setting_value FROM site_settings WHERE airline_id=? AND setting_key='site_notice'").bind(a.id).first():null;
 let notice=null;try{notice=row?JSON.parse(row.setting_value):null}catch{}
 return reply({notice:notice||{enabled:true,title:"Affiliation notice",text:"A separate website using the name “Lupin Air” is not part of the Lupin ecosystem and is not affiliated with or endorsed by Lupin Airlines.",linkText:"",href:""}},200,origin)
}

/* Control Tower routes: authenticate against the shared Lupin Cloud session, never a client-supplied role. */
if(slug==="lupin-airlines"&&p[2]==="admin"){
 const auth=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!auth)return reply({error:"Sign in with your Lupin Cloud account."},401,origin);
 const owner=await env.DB.prepare("SELECT a.id,a.username FROM lupin_sessions s JOIN lupin_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?").bind(await sha(auth),iso()).first();
 if(!owner)return reply({error:"Lupin Cloud session is invalid or expired."},401,origin);
 const primary=String(owner.username).toLowerCase()==="lupin2015";
 const invited=primary?null:await env.DB.prepare("SELECT account_id FROM lupin_admin_invites WHERE account_id=?").bind(owner.id).first();
 if(!primary&&!invited)return reply({error:"Administrator access denied."},403,origin);
 const role=primary?"primary":"admin";
 if(p.length===4&&p[3]==="me"&&request.method==="GET")return reply({ok:true,username:owner.username,role},200,origin);
 if(p.length===4&&p[3]==="overview"&&request.method==="GET"){
  const a=await ensureAirline(env.DB,slug);
  const [users,bookings,flights,admins]=await Promise.all([
   env.DB.prepare("SELECT username,miles,created_at,0 AS banned FROM users WHERE airline_id=? ORDER BY username").bind(a.id).all(),
   env.DB.prepare("SELECT b.booking_id,u.username,b.flight,b.destination,b.date,b.status FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.airline_id=? ORDER BY b.id DESC").bind(a.id).all(),
   env.DB.prepare("SELECT flight,destination,gate,departure,price FROM flights WHERE airline_id=? ORDER BY id").bind(a.id).all(),
   env.DB.prepare("SELECT a.username,i.created_at FROM lupin_admin_invites i JOIN lupin_accounts a ON a.id=i.account_id ORDER BY a.username").all()
  ]);
  return reply({users:users.results,bookings:bookings.results,flights:flights.results,admins:admins.results},200,origin)
 }
 if(p.length===4&&p[3]==="site-notice"&&request.method==="GET"){
  const a=await ensureAirline(env.DB,slug);
  const row=await env.DB.prepare("SELECT setting_value,updated_at FROM site_settings WHERE airline_id=? AND setting_key='site_notice'").bind(a.id).first();
  let notice=null;try{notice=row?JSON.parse(row.setting_value):null}catch{}
  return reply({ok:true,notice:notice||{enabled:true,title:"Affiliation notice",text:"A separate website using the name “Lupin Air” is not part of the Lupin ecosystem and is not affiliated with or endorsed by Lupin Airlines.",linkText:"",href:""},updatedAt:row?.updated_at||null},200,origin)
 }
 if(!primary)return reply({error:"Only the primary administrator can change Control Tower settings."},403,origin);
 if(p.length===4&&p[3]==="site-notice"&&request.method==="POST"){
  let b={};try{b=await request.json()}catch{return reply({error:"Enter valid notice settings."},400,origin)}
  const enabled=b.enabled!==false,title=String(b.title||"Notice").trim().slice(0,100),text=String(b.text||"").trim().slice(0,1200),linkText=String(b.linkText||"").trim().slice(0,80),href=String(b.href||"").trim().slice(0,500);
  if(!title||!text)return reply({error:"A title and notice text are required."},400,origin);
  if(href&&!(href.startsWith("https://")||(href.startsWith("/")&&!href.startsWith("//"))||/^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/.test(href)))return reply({error:"Enter a valid relative or HTTPS link."},400,origin);
  const a=await ensureAirline(env.DB,slug),notice={enabled,title,text,linkText,href},updatedAt=iso();
  await env.DB.prepare("INSERT INTO site_settings(airline_id,setting_key,setting_value,updated_at) VALUES(?,'site_notice',?,?) ON CONFLICT(airline_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at").bind(a.id,JSON.stringify(notice),updatedAt).run();
  return reply({ok:true,notice,updatedAt},200,origin)
 }
 if(p.length===4&&p[3]==="invites"&&request.method==="POST"){
  let b={};try{b=await request.json()}catch{return reply({error:"Enter a username to invite."},400,origin)}
  const username=String(b.username||"").trim();
  if(!username)return reply({error:"Enter a username to invite."},400,origin);
  if(username.toLowerCase()==="lupin2015")return reply({error:"The primary administrator is already protected."},400,origin);
  const target=await env.DB.prepare("SELECT id,username FROM lupin_accounts WHERE username=? COLLATE NOCASE").bind(username).first();
  if(!target)return reply({error:"That username does not exist in Lupin Cloud yet."},404,origin);
  await env.DB.prepare("INSERT INTO lupin_admin_invites(account_id,invited_by,created_at) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET invited_by=excluded.invited_by,created_at=excluded.created_at").bind(target.id,owner.id,iso()).run();
  return reply({ok:true,username:target.username},200,origin)
 }
 if(p.length===5&&p[3]==="invites"&&request.method==="DELETE"){
  const username=decodeURIComponent(p[4]);
  if(username.toLowerCase()==="lupin2015")return reply({error:"The primary administrator cannot be removed."},400,origin);
  const target=await env.DB.prepare("SELECT id FROM lupin_accounts WHERE username=? COLLATE NOCASE").bind(username).first();
  if(target)await env.DB.prepare("DELETE FROM lupin_admin_invites WHERE account_id=?").bind(target.id).run();
  return reply({ok:true},200,origin)
 }
 if(p.length===4&&p[3]==="flights"&&request.method==="POST"||p.length===5&&p[3]==="flights"&&request.method==="POST"){
  let b={};try{b=await request.json()}catch{return reply({error:"Enter valid flight details."},400,origin)}
  const flight=String(b.flight||"").trim(),destination=String(b.destination||"").trim(),gate=String(b.gate||"").trim(),departure=String(b.departure||"").trim(),price=String(b.price||"").trim();
  if(!flight||!destination||!gate||!departure||!price)return reply({error:"All flight fields are required."},400,origin);
  const a=await ensureAirline(env.DB,slug);
  if(p.length===4){
   try{await env.DB.prepare("INSERT INTO flights(airline_id,flight,destination,gate,departure,price) VALUES(?,?,?,?,?,?)").bind(a.id,flight,destination,gate,departure,price).run()}
   catch{return reply({error:"That flight code already exists or could not be saved."},409,origin)}
  }else{
   const oldFlight=decodeURIComponent(p[4]);
   const result=await env.DB.prepare("UPDATE flights SET flight=?,destination=?,gate=?,departure=?,price=? WHERE airline_id=? AND flight=?").bind(flight,destination,gate,departure,price,a.id,oldFlight).run();
   if(!result.meta?.changes)return reply({error:"Flight not found or no changes were made."},404,origin)
  }
  return reply({ok:true,flight},200,origin)
 }
 if(p.length===6&&p[3]==="users"&&p[5]==="miles"&&request.method==="POST"){
  let b={};try{b=await request.json()}catch{return reply({error:"Enter a miles balance."},400,origin)}
  const miles=Number(b.miles);
  if(!Number.isSafeInteger(miles)||miles<0)return reply({error:"Miles must be a non-negative whole number."},400,origin);
  const a=await ensureAirline(env.DB,slug);
  const result=await env.DB.prepare("UPDATE users SET miles=? WHERE airline_id=? AND username=? COLLATE NOCASE").bind(miles,a.id,decodeURIComponent(p[4])).run();
  if(!result.meta?.changes)return reply({error:"Passenger account not found."},404,origin);
  return reply({ok:true,miles},200,origin)
 }
 return reply({error:"Unknown Control Tower endpoint."},404,origin)
}

if(p.length===3&&p[2]==="flights"&&request.method==="GET"){const a=await airline(env.DB,slug);if(!a)return reply({flights:[]},200,origin);const r=await env.DB.prepare("SELECT flight,destination,gate,departure,price FROM flights WHERE airline_id=? ORDER BY id").bind(a.id).all();return reply({flights:r.results},200,origin)}
if(p.length===3&&p[2]==="register"&&request.method==="POST"){const b=await request.json(),username=String(b.username||"").trim(),password=String(b.password||"");if(!/^[A-Za-z0-9_-]{3,20}$/.test(username))return reply({error:"Username must be 3–20 letters, numbers, _ or -."},400,origin);if(password.length<6)return reply({error:"Password must be at least 6 characters."},400,origin);const a=await ensureAirline(env.DB,slug),exists=await env.DB.prepare("SELECT id FROM users WHERE airline_id=? AND username=?").bind(a.id,username).first();if(exists)return reply({error:"That username is already in use."},409,origin);const ph=await hashPassword(password),r=await env.DB.prepare("INSERT INTO users(airline_id,username,password_hash,created_at) VALUES(?,?,?,?)").bind(a.id,username,ph,iso()).run(),t=randomToken();await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(t),r.meta.last_row_id,new Date(Date.now()+2592000000).toISOString()).run();return reply({ok:true,username,miles:0,token:t},201,origin)}
if(p.length===3&&p[2]==="login"&&request.method==="POST"){const b=await request.json(),a=await airline(env.DB,slug);if(!a)return reply({error:"Incorrect username or password."},401,origin);const u=await env.DB.prepare("SELECT * FROM users WHERE airline_id=? AND username=?").bind(a.id,String(b.username||"").trim()).first();if(!u||!(await checkPassword(String(b.password||""),u.password_hash)))return reply({error:"Incorrect username or password."},401,origin);const t=randomToken();await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(t),u.id,new Date(Date.now()+2592000000).toISOString()).run();return reply({ok:true,username:u.username,miles:u.miles,token:t},200,origin)}
if(p.length===3&&p[2]==="link"&&request.method==="POST"){const a=await airline(env.DB,slug);if(!a)return reply({error:"Airline not found."},404,origin);const cloudToken=(request.headers.get("x-lupin-cloud-token")||"").trim();if(!cloudToken)return reply({error:"Lupin Cloud session is required to link accounts."},401,origin);const cloudHash=await sha(cloudToken);const cloud=await env.DB.prepare("SELECT a.id,a.username FROM lupin_sessions s JOIN lupin_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?").bind(cloudHash,iso()).first();if(!cloud)return reply({error:"Lupin Cloud session is invalid or expired."},401,origin);let local=await currentUser(env.DB,request);if(!local){let b={};try{b=await request.json()}catch{}const username=String(b.username||"").trim(),password=String(b.password||"");if(username.toLowerCase()!==String(cloud.username).toLowerCase()||!password)return reply({error:"Enter the matching airline username and password to link accounts."},401,origin);local=await env.DB.prepare("SELECT * FROM users WHERE airline_id=? AND username=? COLLATE NOCASE").bind(a.id,username).first();if(!local||!await checkPassword(password,local.password_hash))return reply({error:"Airline username or password is incorrect; account was not linked."},401,origin)}if(Number(local.airline_id)!==Number(a.id))return reply({error:"Airline account mismatch."},403,origin);if(String(cloud.username).toLowerCase()!==String(local.username).toLowerCase())return reply({error:"The Lupin Cloud username must match the airline username before linking."},409,origin);try{await env.DB.prepare("INSERT INTO lupin_account_links(account_id,airline_id,user_id,linked_at) VALUES(?,?,?,?) ON CONFLICT(account_id,airline_id) DO UPDATE SET user_id=excluded.user_id,linked_at=excluded.linked_at").bind(cloud.id,a.id,local.id,iso()).run()}catch{return reply({error:"This airline account is already linked to a different Lupin Cloud account."},409,origin)}return reply({ok:true,linked:true,username:local.username},200,origin)}
const u=await currentUser(env.DB,request);if(p.length===3&&p[2]==="me"&&request.method==="GET"){if(!u||u.airline_slug!==slug)return reply({error:"Please log in."},401,origin);return reply({username:u.username,miles:u.miles},200,origin)}
if(p.length===3&&p[2]==="miles"&&request.method==="POST"){if(!u||u.airline_slug!==slug)return reply({error:"Please log in."},401,origin);const b=await request.json(),delta=Number(b.delta);if(!Number.isInteger(delta)||delta===0)return reply({error:"Miles change must be a non-zero whole number."},400,origin);const result=await env.DB.prepare("UPDATE users SET miles=miles+? WHERE id=? AND miles+?>=0").bind(delta,u.id,delta).run();if(!result.meta?.changes)return reply({error:"Not enough Lupin Miles for that transaction."},400,origin);const updated=await env.DB.prepare("SELECT miles FROM users WHERE id=?").bind(u.id).first();return reply({ok:true,miles:Number(updated?.miles)||0},200,origin)}
if(p.length===3&&p[2]==="bookings"&&request.method==="GET"){if(!u||u.airline_slug!==slug)return reply({error:"Please log in."},401,origin);const r=await env.DB.prepare("SELECT booking_id AS bookingId,flight,destination,date,time,gate,passengers,fare,status,booked_at AS bookedAt,miles_earned AS milesEarned FROM bookings WHERE user_id=? ORDER BY id DESC").bind(u.id).all();return reply({bookings:r.results},200,origin)}
if(p.length===3&&p[2]==="bookings"&&request.method==="POST"){if(!u||u.airline_slug!==slug)return reply({error:"Please log in."},401,origin);const b=await request.json(),f=await env.DB.prepare("SELECT * FROM flights WHERE airline_id=? AND flight=?").bind(u.airline_id,String(b.flight||"")).first();if(!f)return reply({error:"Flight not found."},400,origin);const id=bookingId(),miles=500,fare=Number(String(f.price).replace(/[^0-9]/g,""))||0;await env.DB.batch([env.DB.prepare("INSERT INTO bookings(booking_id,user_id,airline_id,name,flight,destination,date,time,gate,passengers,fare,miles_earned,status,booked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,u.id,u.airline_id,String(b.name||u.username).slice(0,40),f.flight,f.destination,String(b.date||""),f.departure,f.gate,String(b.passengers||"1 passenger"),fare,miles,"Confirmed",iso()),env.DB.prepare("UPDATE users SET miles=miles+? WHERE id=?").bind(miles,u.id)]);return reply({ok:true,bookingId:id,milesEarned:miles},201,origin)}
if(p.length===5&&p[2]==="bookings"&&p[4]==="cancel"&&request.method==="POST"){if(!u||u.airline_slug!==slug)return reply({error:"Please log in."},401,origin);const b=await env.DB.prepare("SELECT * FROM bookings WHERE booking_id=? AND user_id=?").bind(p[3],u.id).first();if(!b)return reply({error:"Booking not found."},404,origin);if(b.status==="Cancelled")return reply({error:"Booking is already cancelled."},400,origin);await env.DB.batch([env.DB.prepare("UPDATE bookings SET status='Cancelled' WHERE booking_id=? AND user_id=?").bind(p[3],u.id),env.DB.prepare("UPDATE users SET miles=MAX(0,miles-?) WHERE id=?").bind(b.miles_earned,u.id)]);return reply({ok:true},200,origin)}return reply({error:"Not found."},404,origin)}catch(e){return reply({error:"Server error.",detail:String(e.message||e)},500,origin)}}};