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
  vLocal = aQuad;
  vColor = aColorStrength.rgb;
  vStrength = aColorStrength.a;
  vSelected = aFlags.x;
  vSniper = aFlags.y;

  // The marker stays upright while its position follows the animated route.
  vec2 screenOffset = aQuad * 9.0 + vec2(aOffset, 0.0);
  vec2 center = aPositionDirection.xy + vec2(0.5);
  vec3 clip = uCamera * vec3(center + screenOffset / max(uZoom, 0.01), 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
