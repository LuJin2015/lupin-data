const fs=require('fs');
const path=require('path');

const DATA_ROOT=path.join(__dirname,'..','data');

function readJson(name,fallback=null){
  const file=path.join(DATA_ROOT,name);
  if(!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

function writeJson(name,value){
  const file=path.join(DATA_ROOT,name);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
  return value;
}

module.exports={DATA_ROOT,readJson,writeJson};
