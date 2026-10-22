/*
 * LZ-String URI codec, based on the lz-string algorithm.
 * Copyright (c) 2013 Pieroxy. Licensed under the MIT License.
 *
 * The compact plan is intentionally positional to avoid repeating JSON keys.
 *
 * Improvements:
 * - Input and structure validation.
 * - Clearer errors for invalid or corrupted data.
 * - URL-safe compression output.
 * - Legacy Base64 compatibility.
 * - Protection against excessively large decompressed payloads.
 * - Chunk-based output construction in the compressor.
 */

const URI_ALPHABET =
"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

// Maximum allowed size of the decompressed JSON, measured in UTF-16 code units.
const MAX_DECOMPRESSED_LENGTH = 10_000_000;

const hasOwn = (object, key) =>
Object.prototype.hasOwnProperty.call(object, key);

const isRecord = (value) =>
value !== null &&
typeof value === "object" &&
!Array.isArray(value);

function compress(input, bitsPerChar, charFromInt) {
  if (input == null) return "";

  if (typeof input !== "string") {
    throw new TypeError("The compression input must be a string.");
  }

  const dictionary = Object.create(null);
  const toCreate = Object.create(null);

  let c = "";
  let wc = "";
  let w = "";

  let enlargeIn = 2;
  let dictSize = 3;
  let numBits = 2;

  const data = [];
  let dataValue = 0;
  let dataPosition = 0;

  const writeBit = (bit) => {
    dataValue = (dataValue << 1) | bit;

    if (dataPosition === bitsPerChar - 1) {
      data.push(charFromInt(dataValue));
      dataValue = 0;
      dataPosition = 0;
    } else {
      dataPosition++;
    }
  };

  const writeValue = (value, count) => {
    for (let i = 0; i < count; i++) {
      writeBit(value & 1);
      value >>= 1;
    }
  };

  const growDictionaryBits = () => {
    enlargeIn--;

    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits++;
    }
  };

  const emitWord = (word) => {
    if (hasOwn(toCreate, word)) {
      const code = word.charCodeAt(0);

      if (code < 256) {
        writeValue(0, numBits);
        writeValue(code, 8);
      } else {
        writeValue(1, numBits);
        writeValue(code, 16);
      }

      growDictionaryBits();
      delete toCreate[word];
    } else {
      writeValue(dictionary[word], numBits);
    }

    growDictionaryBits();
  };

  for (let i = 0; i < input.length; i++) {
    c = input.charAt(i);

    if (!hasOwn(dictionary, c)) {
      dictionary[c] = dictSize++;
      toCreate[c] = true;
    }

    wc = w + c;

    if (hasOwn(dictionary, wc)) {
      w = wc;
    } else {
      emitWord(w);

      dictionary[wc] = dictSize++;
      w = c;
    }
  }

  if (w !== "") {
    emitWord(w);
  }

  // End-of-stream marker.
  writeValue(2, numBits);

  // Flush the final partial character.
  while (true) {
    dataValue <<= 1;

    if (dataPosition === bitsPerChar - 1) {
      data.push(charFromInt(dataValue));
      break;
    }

    dataPosition++;
  }

  return data.join("");
}

function decompress(
  length,
  resetValue,
  getNextValue,
  maxOutputLength = MAX_DECOMPRESSED_LENGTH,
) {
  const dictionary = [0, 1, 2];

  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;

  let entry = "";
  const result = [];

  let resultLength = 0;

  let dataValue = getNextValue(0);
  let dataPosition = resetValue;
  let dataIndex = 1;

  const readBits = (count) => {
    let bits = 0;
    let power = 1;
    const maxPower = 1 << count;

    while (power !== maxPower) {
      const resb = dataValue & dataPosition;

      dataPosition >>= 1;

      if (dataPosition === 0) {
        dataPosition = resetValue;
        dataValue = getNextValue(dataIndex++);
      }

      if (resb > 0) {
        bits |= power;
      }

      power <<= 1;
    }

    return bits;
  };

  const growDictionaryBits = () => {
    enlargeIn--;

    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits++;
    }
  };

  const appendResult = (value) => {
    resultLength += value.length;

    if (resultLength > maxOutputLength) {
      throw new RangeError(
        "The decompressed routine plan exceeds the permitted size.",
      );
    }

    result.push(value);
  };

  let next = readBits(2);
  let c;

  if (next === 0) {
    c = String.fromCharCode(readBits(8));
  } else if (next === 1) {
    c = String.fromCharCode(readBits(16));
  } else if (next === 2) {
    return "";
  } else {
    throw new Error("Invalid compressed routine plan.");
  }

  dictionary[3] = c;

  let w = c;
  appendResult(c);

  while (true) {
    // The input ended before another complete code could be read.
    if (dataIndex > length) {
      return "";
    }

    let code = readBits(numBits);

    if (code === 0) {
      dictionary[dictSize++] = String.fromCharCode(readBits(8));
      code = dictSize - 1;
      growDictionaryBits();
    } else if (code === 1) {
      dictionary[dictSize++] = String.fromCharCode(readBits(16));
      code = dictSize - 1;
      growDictionaryBits();
    } else if (code === 2) {
      return result.join("");
    }

    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits++;
    }

    if (dictionary[code] !== undefined) {
      entry = dictionary[code];
    } else if (code === dictSize) {
      entry = w + w.charAt(0);
    } else {
      return null;
    }

    appendResult(entry);

    dictionary[dictSize++] = w + entry.charAt(0);

    growDictionaryBits();

    w = entry;
  }
}

const lzCompress = (text) =>
compress(text, 6, (value) => URI_ALPHABET.charAt(value));

const lzDecompress = (text) => {
  if (text == null) {
    return "";
  }

  if (typeof text !== "string") {
    throw new TypeError("The compressed data must be a string.");
  }

  if (text === "") {
    return null;
  }

  // Some URL query parsers convert "+" into a space.
  const normalized = text.replace(/ /g, "+");

  // Valid characters from the LZ-String URI alphabet.
  if (!/^[A-Za-z0-9+$-]+$/.test(normalized)) {
    throw new Error(
      "The compressed routine plan contains invalid characters.",
    );
  }

  return decompress(
    normalized.length,
    32,
    (index) => {
      if (index >= normalized.length) {
        return 0;
      }

      return URI_ALPHABET.indexOf(normalized.charAt(index));
    },
  );
};

function compactSettings(settings = {}) {
  if (settings == null) {
    settings = {};
  }

  if (!isRecord(settings)) {
    throw new TypeError(
      "Routine exercise settings must be an object.",
    );
  }

  return Object.fromEntries(
    Object.entries(settings).map(([id, value]) => {
      // A null setting is treated as an empty setting.
      const setting = value == null ? {} : value;

      if (!isRecord(setting)) {
        throw new TypeError(
          `Exercise settings for "${id}" must be an object.`,
        );
      }

      return [
        id,
        [
          setting.sets ?? null,
          setting.reps ?? null,
          setting.restSeconds ?? null,
          setting.comment ?? "",
          setting.targetMinutes ?? null,
        ],
      ];
    }),
  );
}

function expandSettings(settings = {}) {
  if (settings == null) {
    settings = {};
  }

  if (!isRecord(settings)) {
    throw new Error("Invalid compact exercise settings.");
  }

  return Object.fromEntries(
    Object.entries(settings).map(([id, value]) => {
      const row = value == null ? [] : value;

      if (!Array.isArray(row)) {
        throw new Error(
          `Invalid compact exercise settings for "${id}".`,
        );
      }

      return [
        id,
        {
          sets: row[0],
          reps: row[1],
          restSeconds: row[2],
          comment: row[3] || "",
          targetMinutes: row[4],
        },
      ];
    }),
  );
}

function compactExercise(exercise) {
  if (!isRecord(exercise)) {
    throw new TypeError(
      "Each exercise must be an object.",
    );
  }

  return [
    exercise.id,
    exercise.name,
    exercise.muscle,
    exercise.secondary || [],
    exercise.equipment || "",
    exercise.sets ?? null,
    exercise.reps ?? null,
    exercise.rest ?? null,
    exercise.duration ?? null,
    exercise.description || "",
    exercise.media || "",
    exercise.poster || "",
    exercise.mediaType || "",
    exercise.cues || [],
    exercise.trackSets ?? true,
    exercise.trackReps ?? true,
  ];
}

function expandExercise(value = []) {
  if (!Array.isArray(value) || value.length < 16) {
    throw new Error("Invalid compact exercise.");
  }

  return {
    id: value[0],
    name: value[1],
    muscle: value[2],
    secondary: value[3] || [],
    equipment: value[4] || "",
    sets: value[5],
    reps: value[6],
    rest: value[7],
    duration: value[8],
    description: value[9] || "",
    media: value[10] || "",
    poster: value[11] || "",
    mediaType: value[12] || "",
    cues: value[13] || [],
    trackSets: value[14] ?? true,
    trackReps: value[15] ?? true,
    custom: true,
  };
}

function compactPlan(payload) {
  if (!isRecord(payload)) {
    throw new TypeError(
      "The routine plan payload must be an object.",
    );
  }

  if (!Array.isArray(payload.routines)) {
    throw new TypeError(
      "The routine plan must contain a routines array.",
    );
  }

  const exercises = payload.exercises ?? [];

  if (!Array.isArray(exercises)) {
    throw new TypeError(
      "The routine plan exercises must be an array.",
    );
  }

  const compactRoutines = payload.routines.map((routine, index) => {
    if (!isRecord(routine)) {
      throw new TypeError(
        `Routine at position ${index} must be an object.`,
      );
    }

    const routineExercises = routine.exercises ?? [];

    if (!Array.isArray(routineExercises)) {
      throw new TypeError(
        `Exercises for routine at position ${index} must be an array.`,
      );
    }

    return [
      routine.id,
      routine.name,
      routine.group || "",
      routineExercises,
      compactSettings(routine.exerciseSettings),
    ];
  });

  return [
    1,
    compactRoutines,
    exercises.map(compactExercise),
  ];
}

function expandPlan(value) {
  if (
    !Array.isArray(value) ||
    value[0] !== 1 ||
    !Array.isArray(value[1])
  ) {
    throw new Error("Invalid compact routine plan.");
  }

  const rawExercises = value[2] ?? [];

  if (!Array.isArray(rawExercises)) {
    throw new Error(
      "The compact routine plan contains an invalid exercises list.",
    );
  }

  const routines = value[1].map((routine, index) => {
    if (!Array.isArray(routine) || routine.length < 4) {
      throw new Error(
        `Invalid compact routine at position ${index}.`,
      );
    }

    const routineExercises = routine[3] ?? [];

    if (!Array.isArray(routineExercises)) {
      throw new Error(
        `Invalid exercises list in routine at position ${index}.`,
      );
    }

    return {
      id: routine[0],
      name: routine[1],
      group: routine[2] || "",
      exercises: routineExercises,
      exerciseSettings: expandSettings(routine[4]),
    };
  });

  const exercises = rawExercises.map((exercise, index) => {
    if (!Array.isArray(exercise)) {
      throw new Error(
        `Invalid compact exercise at position ${index}.`,
      );
    }

    return expandExercise(exercise);
  });

  return {
    type: "profit-routine-plan",
    version: 1,
    routines,
    exercises,
  };
}

function decodeLegacyPlan(encoded) {
  const source = encoded
  .replace(/-/g, "+")
  .replace(/_/g, "/");

  // Only allow valid Base64 characters and up to two trailing "=" signs.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(source)) {
    throw new Error(
      "The legacy routine plan contains invalid Base64 characters.",
    );
  }

  const unpadded = source.replace(/=+$/, "");
  const providedPadding = source.length - unpadded.length;
  const remainder = unpadded.length % 4;

  if (remainder === 1) {
    throw new Error(
      "The legacy routine plan has an invalid Base64 length.",
    );
  }

  const requiredPadding = (4 - remainder) % 4;

  // If padding was supplied, make sure it is consistent.
  if (
    providedPadding > 0 &&
    (
      source.length % 4 !== 0 ||
      providedPadding !== requiredPadding
    )
  ) {
    throw new Error(
      "The legacy routine plan has invalid Base64 padding.",
    );
  }

  // Restore omitted padding when the old URL format did not include it.
  const normalized =
  unpadded + "=".repeat(requiredPadding);

  let binary;

  try {
    binary = atob(normalized);
  } catch {
    throw new Error(
      "The legacy routine plan could not be decoded from Base64.",
    );
  }

  const bytes = Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0),
  );

  let json;

  try {
    // Reject malformed UTF-8 instead of silently replacing invalid bytes.
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "The legacy routine plan contains invalid UTF-8 data.",
    );
  }

  if (json.length > MAX_DECOMPRESSED_LENGTH) {
    throw new RangeError(
      "The legacy routine plan exceeds the permitted size.",
    );
  }

  try {
    return JSON.parse(json);
  } catch {
    throw new Error(
      "The legacy routine plan does not contain valid JSON.",
    );
  }
}

export function encodeRoutinePlan(payload) {
  const compact = compactPlan(payload);
  const json = JSON.stringify(compact);

  if (json.length > MAX_DECOMPRESSED_LENGTH) {
    throw new RangeError(
      "The routine plan exceeds the permitted size.",
    );
  }

  // LZ-String emits "+"; "_" is used as its URL-safe replacement.
  // The URI alphabet does not otherwise contain "_", so the mapping
  // remains reversible.
  const compressed = lzCompress(json).replace(/\+/g, "_");

  return `lz1${compressed}`;
}

export function decodeRoutinePlan(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new TypeError(
      "The encoded routine plan must be a non-empty string.",
    );
  }

  if (encoded.startsWith("lz1")) {
    const compressed = encoded
    .slice(3)
    .replace(/_/g, "+");

    const json = lzDecompress(compressed);

    if (typeof json !== "string" || json.length === 0) {
      throw new Error(
        "The compressed routine plan is invalid or corrupted.",
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(
        "The compressed routine plan does not contain valid JSON.",
      );
    }

    return expandPlan(parsed);
  }

  // Backward compatibility: URL-safe Base64 containing the full JSON.
  return decodeLegacyPlan(encoded);
}
