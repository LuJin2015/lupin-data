const express=require('express');
const cors=require('cors');
const bcrypt=require('bcryptjs');
const Database=require('better-sqlite3');
const crypto=require('crypto');
const {flights}=require('./services');

const app=express();
const db=new Database(process.env.DATABASE_PATH||'lupin.db');
const PORT=process.env.PORT||3000;
const ADMIN_PASSWORD=process.env.LUPIN_ADMIN_PASSWORD;

app.use(cors({origin:true,credentials:true}));
app.use(express.json());

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 miles INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_id TEXT UNIQUE NOT NULL,
 user_id INTEGER NOT NULL,
 name TEXT NOT NULL,
 flight TEXT NOT NULL,
 destination TEXT NOT NULL,
 date TEXT NOT NULL,
 time TEXT NOT NULL,
 gate TEXT NOT NULL,
 passengers TEXT NOT NULL,
 fare INTEGER NOT NULL,
 miles_earned INTEGER NOT NULL DEFAULT 500,
 status TEXT NOT NULL DEFAULT 'Confirmed',
 booked_at TEXT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const cleanUsername=u=>String(u||'').trim();
const authUser=(req,res,next)=>{
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
 if(!token)return res.status(401).json({error:'Please log in.'});
 const row=db.prepare('SELECT * FROM users WHERE id=?').get(Number(token.split('.')[0]));
 if(!row)return res.status(401).json({error:'Session expired.'});
 req.user=row;next();
};
const makeToken=id=>String(id)+'.'+crypto.randomBytes(24).toString('hex');
const findFlight=code=>flights.getFlight(code);

app.get('/health',(req,res)=>res.json({ok:true,service:'lupin-data'}));
app.get('/flights',(req,res)=>res.json({flights:flights.getFlights()}));

app.post('/auth/register',async(req,res)=>{
 const username=cleanUsername(req.body.username),password=String(req.body.password||'');
 if(!/^[A-Za-z0-9_-]{3,20}$/.test(username))return res.status(400).json({error:'Username must be 3–20 letters, numbers, _ or -.'});
 if(password.length<6)return res.status(400).json({error:'Password must be at least 6 characters.'});
 try{
  const hash=await bcrypt.hash(password,12);
  const result=db.prepare('INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)').run(username,hash,new Date().toISOString());
  res.status(201).json({ok:true,username,token:makeToken(result.lastInsertRowid)});
 }catch(e){res.status(409).json({error:'That username is already in use.'})}
});

app.post('/auth/login',async(req,res)=>{
 const username=cleanUsername(req.body.username),password=String(req.body.password||'');
 const user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
 if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({error:'Incorrect username or password.'});
 res.json({ok:true,username:user.username,token:makeToken(user.id)});
});
app.post('/auth/logout',(req,res)=>res.json({ok:true}));
app.get('/me',authUser,(req,res)=>res.json({username:req.user.username,miles:req.user.miles}));
app.get('/me/bookings',authUser,(req,res)=>{
 const bookings=db.prepare('SELECT booking_id as bookingId,flight,destination,date,time,gate,passengers,fare,status,booked_at as bookedAt FROM bookings WHERE user_id=? ORDER BY id DESC').all(req.user.id);
 res.json({bookings});
});
app.post('/bookings',authUser,(req,res)=>{
 const f=findFlight(req.body.flight);
 if(!f)return res.status(400).json({error:'Flight not found.'});
 const bookingId='LUP-'+crypto.randomBytes(3).toString('hex').toUpperCase();
 const miles=500;
 db.prepare('INSERT INTO bookings(booking_id,user_id,name,flight,destination,date,time,gate,passengers,fare,miles_earned,status,booked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(bookingId,req.user.id,String(req.body.name||req.user.username).slice(0,40),f.flight,f.destination,String(req.body.date||''),f.departure,f.gate,String(req.body.passengers||'1 passenger'),Number(String(f.price).replace(/[^0-9]/g,''))||0,miles,'Confirmed',new Date().toISOString());
 db.prepare('UPDATE users SET miles=miles+? WHERE id=?').run(miles,req.user.id);
 res.status(201).json({ok:true,bookingId,milesEarned:miles});
});
app.post('/bookings/:id/cancel',authUser,(req,res)=>{
 const b=db.prepare('SELECT * FROM bookings WHERE booking_id=? AND user_id=?').get(req.params.id,req.user.id);
 if(!b)return res.status(404).json({error:'Booking not found.'});
 if(b.status==='Cancelled')return res.status(400).json({error:'Booking is already cancelled.'});
 db.prepare('UPDATE bookings SET status=? WHERE booking_id=?').run('Cancelled',b.booking_id);
 db.prepare('UPDATE users SET miles=MAX(0,miles-?) WHERE id=?').run(b.miles_earned,req.user.id);
 res.json({ok:true});
});

const admin=(req,res,next)=>{
 if(!ADMIN_PASSWORD)return res.status(503).json({error:'Admin service is not configured.'});
 const supplied=req.headers['x-lupin-admin-password'];
 if(supplied!==ADMIN_PASSWORD)return res.status(401).json({error:'Admin authentication required.'});
 next();
};
app.get('/admin/flights',admin,(req,res)=>res.json({flights:flights.getFlights()}));
app.post('/admin/flights',admin,(req,res)=>{
  try{res.status(201).json({ok:true,flight:flights.addFlight(req.body)})}
  catch(e){res.status(400).json({error:e.message})}
});
app.patch('/admin/flights/:code',admin,(req,res)=>{
  const flight=flights.updateFlight(req.params.code,req.body);
  if(!flight)return res.status(404).json({error:'Flight not found.'});
  res.json({ok:true,flight});
});
app.delete('/admin/flights/:code',admin,(req,res)=>{
  if(!flights.removeFlight(req.params.code))return res.status(404).json({error:'Flight not found.'});
  res.json({ok:true});
});
app.get('/admin/bookings',admin,(req,res)=>{
 const bookings=db.prepare('SELECT booking_id,username,flight,destination,date,time,gate,passengers,fare,status,booked_at FROM bookings JOIN users ON users.id=bookings.user_id ORDER BY bookings.id DESC').all();
 res.json({bookings});
});

app.listen(PORT,()=>console.log('Lupin Data listening on '+PORT));
