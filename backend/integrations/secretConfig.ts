export function readBase64Secret(name: string, expectedBytes?: number): Buffer {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.toString('base64') !== value ||
    (expectedBytes === undefined ? decoded.length < 32 : decoded.length !== expectedBytes)
  ) {
    const requirement = expectedBytes === undefined
      ? 'at least 32 bytes encoded as canonical base64'
      : `exactly ${expectedBytes} bytes encoded as canonical base64`;
    throw new Error(`${name} must be ${requirement}`);
  }

  return decoded;
}
