const flights = require("../data/flights.json");

function json(data, status = 200) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    },
    body: JSON.stringify(data)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json({}, 204);

  const path = event.path || "/";
  if (path.endsWith("/health")) return json({ ok: true, service: "lupin-data" });

  if (path.endsWith("/flights")) {
    return json({ flights });
  }

  return json({
    error: "Endpoint not configured yet",
    message: "Connect this handler to the production database/auth adapter before enabling account writes."
  }, 501);
};
