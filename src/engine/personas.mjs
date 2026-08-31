const PERSONA_IDS = new Set(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
const PROFILE_SOURCES = ["okta", "hris", "ad"];

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function validatePersonasFixture(value) {
  if (!Array.isArray(value) || value.length !== PERSONA_IDS.size)
    throw new TypeError("personas fixture must contain exactly 8 entries");

  const ids = new Set();
  for (const persona of value) {
    if (!isPlainObject(persona)
        || !PERSONA_IDS.has(persona.id)
        || ids.has(persona.id)
        || typeof persona.category !== "string"
        || typeof persona.region !== "string"
        || !isPlainObject(persona.profiles))
      throw new TypeError("personas fixture has an invalid persona");

    ids.add(persona.id);
    for (const source of PROFILE_SOURCES) {
      const profile = persona.profiles[source];
      if (!isPlainObject(profile)
          || Object.values(profile).some((attribute) => typeof attribute !== "string"))
        throw new TypeError(`personas fixture has an invalid ${source} profile`);
    }
  }

  if (ids.size !== PERSONA_IDS.size)
    throw new TypeError("personas fixture must contain P1 through P8 exactly once");
  return value;
}
