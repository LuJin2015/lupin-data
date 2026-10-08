INSERT OR IGNORE INTO airlines(slug,name,created_at) VALUES('lupin-airlines','Lupin Airlines',datetime('now'));

INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 001','Lupin''s House','L','08:15','S$101' FROM airlines WHERE slug='lupin-airlines';
INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 002','Mdm Wrong-Wrong''s House','WW','09:45','S$202' FROM airlines WHERE slug='lupin-airlines';
INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 003','Somewhere Good','G','11:00','S$303' FROM airlines WHERE slug='lupin-airlines';
INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 004','Somewhere Better','B','12:30','S$404' FROM airlines WHERE slug='lupin-airlines';
INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 005','Somewhere Even Better','EB','14:00','S$505' FROM airlines WHERE slug='lupin-airlines';
INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 006','Somewhere Best','S','15:30','S$606' FROM airlines WHERE slug='lupin-airlines';
INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 000','Somewhere Worst','W','17:00','S$0' FROM airlines WHERE slug='lupin-airlines';
INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 404','Somewhere Nice','N','18:15','S$404' FROM airlines WHERE slug='lupin-airlines';
INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 007','Scraggy''s House','SG','19:30','S$707' FROM airlines WHERE slug='lupin-airlines';
INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 314','Singapore, Probably','SGP','21:00','S$314' FROM airlines WHERE slug='lupin-airlines';
INSERT OR IGNORE INTO flights(airline_id,flight,destination,gate,departure,price)
SELECT id,'LP 9001','The Moon','M','23:59','S$9001' FROM airlines WHERE slug='lupin-airlines';
