const {readJson,writeJson}=require('../../core/data-store');

const FILE='flights.json';

function getFlights(){
  return readJson(FILE,[]);
}

function getFlight(code){
  return getFlights().find(f=>f.flight===code)||null;
}

function addFlight(flight){
  const flights=getFlights();
  if(!flight||!flight.flight||!flight.destination) throw new Error('A flight needs at least a flight code and destination.');
  if(flights.some(f=>f.flight===flight.flight)) throw new Error('That flight already exists.');
  flights.push(flight);
  writeJson(FILE,flights);
  return flight;
}

function updateFlight(code,changes){
  const flights=getFlights();
  const index=flights.findIndex(f=>f.flight===code);
  if(index===-1) return null;
  flights[index]={...flights[index],...changes,flight:code};
  writeJson(FILE,flights);
  return flights[index];
}

function removeFlight(code){
  const flights=getFlights();
  const next=flights.filter(f=>f.flight!==code);
  if(next.length===flights.length) return false;
  writeJson(FILE,next);
  return true;
}

module.exports={getFlights,getFlight,addFlight,updateFlight,removeFlight};
