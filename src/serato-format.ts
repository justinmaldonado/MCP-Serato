export interface SeratoNode {
  tag: string;
  length: number;
  value: Buffer | SeratoNode[];
}

const CONTAINER_TAGS = new Set(["otrk", "osrt", "ocol", "opth", "ovct", "oent", "adat"]);

export function decodeUtf16Be(buffer: Buffer): string {
  const evenLength = buffer.length - (buffer.length % 2);
  const swapped = Buffer.allocUnsafe(evenLength);
  for (let i = 0; i < evenLength; i += 2) {
    swapped[i] = buffer[i + 1];
    swapped[i + 1] = buffer[i];
  }
  return swapped.toString("utf16le").replace(/\0+$/u, "");
}

export function parseNodes(buffer: Buffer, start = 0, end = buffer.length): SeratoNode[] {
  const nodes: SeratoNode[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const tag = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32BE(offset + 4);
    const valueStart = offset + 8;
    const valueEnd = valueStart + length;
    if (!/^[\x20-\x7e]{4}$/u.test(tag) || valueEnd > end) {
      throw new Error(`Invalid Serato record at byte ${offset} (tag=${JSON.stringify(tag)}, length=${length})`);
    }
    const raw = buffer.subarray(valueStart, valueEnd);
    nodes.push({ tag, length, value: CONTAINER_TAGS.has(tag) ? parseNodes(raw) : raw });
    offset = valueEnd;
  }
  if (offset !== end) throw new Error(`Trailing ${end - offset} byte(s) in Serato data`);
  return nodes;
}

export function textValue(node: SeratoNode | undefined): string | undefined {
  if (!node || !Buffer.isBuffer(node.value)) return undefined;
  return decodeUtf16Be(node.value);
}

export function child(nodes: SeratoNode[], tag: string): SeratoNode | undefined {
  return nodes.find((node) => node.tag === tag);
}
