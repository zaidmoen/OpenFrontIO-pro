#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 aPositionDirection;
layout(location = 2) in vec4 aColorStrength;
layout(location = 3) in vec2 aFlags;
layout(location = 4) in float aOffset;

uniform mat3 uCamera;
uniform float uZoom;

out vec2 vLocal;
flat out vec3 vColor;
flat out float vStrength;
flat out float vSelected;
flat out float vSniper;

void main() {
  vec2 direction = aPositionDirection.zw;
  float lengthSquared = dot(direction, direction);
  direction = lengthSquared > 0.0001 ? direction * inversesqrt(lengthSquared) : vec2(0.0, -1.0);
  vec2 right = vec2(-direction.y, direction.x);
  vLocal = aQuad;
  vColor = aColorStrength.rgb;
  vStrength = aColorStrength.a;
  vSelected = aFlags.x;
  vSniper = aFlags.y;
  // A small screen-sized footprint stays readable at any map zoom.
  vec2 screenOffset = (right * aQuad.x + direction * -aQuad.y) * 9.0 + right * aOffset;
  vec2 center = aPositionDirection.xy + vec2(0.5);
  vec3 clip = uCamera * vec3(center + screenOffset / max(uZoom, 0.01), 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
