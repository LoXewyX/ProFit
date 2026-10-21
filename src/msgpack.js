const encoder = new TextEncoder();
const decoder = new TextDecoder();

const MAX_UINT64 = 0xffffffffffffffffn;
const MIN_INT64 = -0x8000000000000000n;
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export function encodeMessagePack(value) {
  let buffer = new Uint8Array(256);
  let view = new DataView(buffer.buffer);
  let offset = 0;

  const ensure = (size) => {
    const needed = offset + size;
    if (needed <= buffer.length) return;

    let capacity = buffer.length;
    while (capacity < needed) capacity = Math.max(capacity * 2, needed);
    const next = new Uint8Array(capacity);
    next.set(buffer.subarray(0, offset));
    buffer = next;
    view = new DataView(buffer.buffer);
  };

  const byte = (value) => {
    ensure(1);
    buffer[offset++] = value;
  };
  const uint16 = (value) => {
    ensure(2);
    view.setUint16(offset, value);
    offset += 2;
  };
  const uint32 = (value) => {
    ensure(4);
    view.setUint32(offset, value);
    offset += 4;
  };
  const int16 = (value) => {
    ensure(2);
    view.setInt16(offset, value);
    offset += 2;
  };
  const int32 = (value) => {
    ensure(4);
    view.setInt32(offset, value);
    offset += 4;
  };
  const uint64 = (value) => {
    ensure(8);
    view.setBigUint64(offset, value);
    offset += 8;
  };
  const int64 = (value) => {
    ensure(8);
    view.setBigInt64(offset, value);
    offset += 8;
  };
  const float64 = (value) => {
    byte(0xcb);
    ensure(8);
    view.setFloat64(offset, value);
    offset += 8;
  };
  const raw = (bytes) => {
    ensure(bytes.length);
    buffer.set(bytes, offset);
    offset += bytes.length;
  };

  const writeLength = (length, fixLimit, fixPrefix, marker16, marker32) => {
    if (length < fixLimit) byte(fixPrefix | length);
    else if (length <= 0xffff) {
      byte(marker16);
      uint16(length);
    } else {
      byte(marker32);
      uint32(length);
    }
  };

  const writeNumberInteger = (n) => {
    // Ruta rápida para Number: evita convertir cada entero pequeño a BigInt.
    if (n >= 0) {
      if (n <= 0x7f) byte(n);
      else if (n <= 0xff) { byte(0xcc); byte(n); }
      else if (n <= 0xffff) { byte(0xcd); uint16(n); }
      else if (n <= 0xffffffff) { byte(0xce); uint32(n); }
      else { byte(0xcf); uint64(BigInt(n)); }
    } else {
      if (n >= -32) byte(0x100 + n);
      else if (n >= -128) { byte(0xd0); byte(n & 255); }
      else if (n >= -32768) { byte(0xd1); int16(n); }
      else if (n >= -2147483648) { byte(0xd2); int32(n); }
      else { byte(0xd3); int64(BigInt(n)); }
    }
  };

  const writeInteger = (n) => {
    if (n >= 0n) {
      if (n <= 0x7fn) byte(Number(n));
      else if (n <= 0xffn) { byte(0xcc); byte(Number(n)); }
      else if (n <= 0xffffn) { byte(0xcd); uint16(Number(n)); }
      else if (n <= 0xffffffffn) { byte(0xce); uint32(Number(n)); }
      else if (n <= MAX_UINT64) { byte(0xcf); uint64(n); }
      else throw new RangeError('Entero fuera del rango uint64 de MessagePack.');
    } else {
      if (n >= -32n) byte(Number(256n + n));
      else if (n >= -128n) { byte(0xd0); byte(Number(BigInt.asUintN(8, n))); }
      else if (n >= -32768n) { byte(0xd1); int16(Number(n)); }
      else if (n >= -2147483648n) { byte(0xd2); int32(Number(n)); }
      else if (n >= MIN_INT64) { byte(0xd3); int64(n); }
      else throw new RangeError('Entero fuera del rango int64 de MessagePack.');
    }
  };

  const write = (item) => {
    if (item === null || item === undefined) { byte(0xc0); return; }
    if (item === false) { byte(0xc2); return; }
    if (item === true) { byte(0xc3); return; }

    if (typeof item === 'number') {
      if (Object.is(item, -0)) { float64(item); return; }
      if (Number.isSafeInteger(item)) { writeNumberInteger(item); return;}
      float64(item);
      return;
    }

    if (typeof item === 'bigint') {
      writeInteger(item);
      return;
    }

    if (typeof item === 'string') {
      const bytes = encoder.encode(item);
      if (bytes.length < 32) byte(0xa0 | bytes.length);
      else if (bytes.length <= 0xff) { byte(0xd9); byte(bytes.length); }
      else if (bytes.length <= 0xffff) { byte(0xda); uint16(bytes.length); }
      else { byte(0xdb); uint32(bytes.length); }
      raw(bytes);
      return;
    }

    if (Array.isArray(item)) {
      writeLength(item.length, 16, 0x90, 0xdc, 0xdd);
      for (let i = 0; i < item.length; i++) write(item[i]);
      return;
    }

    if (item instanceof Uint8Array || item instanceof ArrayBuffer) {
      const bytes = item instanceof Uint8Array ? item : new Uint8Array(item);
      if (bytes.length <= 0xff) { byte(0xc4); byte(bytes.length); }
      else if (bytes.length <= 0xffff) { byte(0xc5); uint16(bytes.length); }
      else { byte(0xc6); uint32(bytes.length); }
      raw(bytes);
      return;
    }

    if (typeof item === 'object') {
      const entries = Object.entries(item).filter(([, entry]) => entry !== undefined);
      writeLength(entries.length, 16, 0x80, 0xde, 0xdf);
      for (const [key, entry] of entries) {
        write(key);
        write(entry);
      }
      return;
    }

    throw new TypeError(`Tipo MessagePack no compatible: ${typeof item}`);
  };

  write(value);
  return buffer.slice(0, offset);
}

export function decodeMessagePack(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const requireBytes = (length) => {
    if (length < 0 || offset + length > bytes.length) {
      throw new Error('Mensaje MessagePack truncado o inválido.');
    }
  };
  const uint8 = () => {
    requireBytes(1);
    return bytes[offset++];
  };
  const uint16 = () => {
    requireBytes(2);
    const value = view.getUint16(offset);
    offset += 2;
    return value;
  };
  const uint32 = () => {
    requireBytes(4);
    const value = view.getUint32(offset);
    offset += 4;
    return value;
  };
  const int64ToJS = (value) =>
    value >= MIN_SAFE_BIGINT && value <= MAX_SAFE_BIGINT ? Number(value) : value;
  const readString = (length) => {
    requireBytes(length);
    const value = decoder.decode(bytes.subarray(offset, offset + length));
    offset += length;
    return value;
  };
  const readBinary = (length) => {
    requireBytes(length);
    const value = bytes.slice(offset, offset + length);
    offset += length;
    return value;
  };
  const readArray = (length, read) => {
    // Cada elemento necesita al menos un byte; evita reservar arrays imposibles.
    requireBytes(length);
    const result = new Array(length);
    for (let i = 0; i < length; i++) result[i] = read();
    return result;
  };
  const readMap = (length, read) => {
    // Cada entrada necesita como mínimo un byte para la clave y otro para el valor.
    requireBytes(length * 2);
    const result = {};
    for (let i = 0; i < length; i++) {
      const key = read();
      const value = read();
      // Evita que una clave "__proto__" modifique el prototipo del objeto.
      Object.defineProperty(result, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  };

  const read = () => {
    const marker = uint8();
    if (marker <= 0x7f) return marker;
    if (marker >= 0xe0) return marker - 256;
    if ((marker & 0xe0) === 0xa0) return readString(marker & 31);
    if ((marker & 0xf0) === 0x90) return readArray(marker & 15, read);
    if ((marker & 0xf0) === 0x80) return readMap(marker & 15, read);

    if (marker === 0xc0) return null;
    if (marker === 0xc2) return false;
    if (marker === 0xc3) return true;
    if (marker === 0xcc) return uint8();
    if (marker === 0xcd) return uint16();
    if (marker === 0xce) return uint32();
    if (marker === 0xcf) {
      requireBytes(8);
      const value = view.getBigUint64(offset);
      offset += 8;
      return int64ToJS(value);
    }
    if (marker === 0xd0) {
      requireBytes(1);
      return view.getInt8(offset++);
    }
    if (marker === 0xd1) {
      requireBytes(2);
      const value = view.getInt16(offset);
      offset += 2;
      return value;
    }
    if (marker === 0xd2) {
      requireBytes(4);
      const value = view.getInt32(offset);
      offset += 4;
      return value;
    }
    if (marker === 0xd3) {
      requireBytes(8);
      const value = view.getBigInt64(offset);
      offset += 8;
      return int64ToJS(value);
    }
    if (marker === 0xca) {
      requireBytes(4);
      const value = view.getFloat32(offset);
      offset += 4;
      return value;
    }
    if (marker === 0xcb) {
      requireBytes(8);
      const value = view.getFloat64(offset);
      offset += 8;
      return value;
    }
    if (marker === 0xd9) return readString(uint8());
    if (marker === 0xda) return readString(uint16());
    if (marker === 0xdb) return readString(uint32());
    if (marker === 0xdc) return readArray(uint16(), read);
    if (marker === 0xdd) return readArray(uint32(), read);
    if (marker === 0xde) return readMap(uint16(), read);
    if (marker === 0xdf) return readMap(uint32(), read);
    if (marker === 0xc4) return readBinary(uint8());
    if (marker === 0xc5) return readBinary(uint16());
    if (marker === 0xc6) return readBinary(uint32());

    throw new Error(`Formato MessagePack no admitido (0x${marker.toString(16)}).`);
  };

  const value = read();
  if (offset !== bytes.length) throw new Error('El archivo contiene datos adicionales.');
  return value;
}
