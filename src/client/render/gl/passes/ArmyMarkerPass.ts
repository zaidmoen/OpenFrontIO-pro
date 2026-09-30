import { DynamicInstanceBuffer } from "../DynamicBuffer";
import fragSrc from "../shaders/army-marker/army-marker.frag.glsl?raw";
import vertSrc from "../shaders/army-marker/army-marker.vert.glsl?raw";
import { createProgram } from "../utils/GlUtils";

/** One visible formation, measured in screen pixels independently of zoom. */
export interface ArmyMarker {
  x: number;
  y: number;
  directionX: number;
  directionY: number;
  colorR: number;
  colorG: number;
  colorB: number;
  strength: number;
  selected: boolean;
  sniper: boolean;
  offset: number;
}

// center(2), direction(2), color(3), strength, selected, sniper, lateral offset
const FLOATS_PER_MARKER = 11;

/** Instanced arrows and trails: a single draw call regardless of army size. */
export class ArmyMarkerPass {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quad: WebGLBuffer;
  private readonly instances: DynamicInstanceBuffer;
  private readonly uCamera: WebGLUniformLocation;
  private readonly uZoom: WebGLUniformLocation;
  private count = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, vertSrc, fragSrc);
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.uZoom = gl.getUniformLocation(this.program, "uZoom")!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const instanceBuffer = gl.createBuffer()!;
    this.instances = new DynamicInstanceBuffer(
      gl,
      instanceBuffer,
      64,
      FLOATS_PER_MARKER,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    const stride = FLOATS_PER_MARKER * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 32);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 40);
    gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
  }

  setMarkers(markers: readonly ArmyMarker[]): void {
    this.count = markers.length;
    if (!this.count) return;
    this.instances.ensureCapacity(this.count);
    const data = this.instances.float32;
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const offset = i * FLOATS_PER_MARKER;
      data[offset] = m.x;
      data[offset + 1] = m.y;
      data[offset + 2] = m.directionX;
      data[offset + 3] = m.directionY;
      data[offset + 4] = m.colorR;
      data[offset + 5] = m.colorG;
      data[offset + 6] = m.colorB;
      data[offset + 7] = m.strength;
      data[offset + 8] = m.selected ? 1 : 0;
      data[offset + 9] = m.sniper ? 1 : 0;
      data[offset + 10] = m.offset;
    }
    glUpload(
      this.gl,
      this.instances.buffer,
      data.subarray(0, this.count * FLOATS_PER_MARKER),
    );
  }

  draw(camera: Float32Array, zoom: number): void {
    if (!this.count) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, camera);
    gl.uniform1f(this.uZoom, zoom);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.instances.dispose();
    this.gl.deleteBuffer(this.quad);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}

function glUpload(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  data: Float32Array,
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
}
