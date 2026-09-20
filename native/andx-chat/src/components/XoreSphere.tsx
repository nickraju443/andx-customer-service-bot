import React from 'react';
import Svg, { Circle, Defs, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';

export interface XoreSphereProps {
  size?: number;
  showLabel?: boolean;          // "XORE" text overlay
  glow?: boolean;
}

/**
 * The XORE sphere — cyan radial gradient with subtle inner shadow + optional
 * "XORE" text overlay. Renders identically on iOS + Android via react-native-svg.
 */
export const XoreSphere: React.FC<XoreSphereProps> = ({ size = 64, showLabel = false, glow = false }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="xoreCore" cx="35%" cy="30%" rx="75%" ry="75%">
          <Stop offset="0%" stopColor="#7df7ff" />
          <Stop offset="28%" stopColor="#00e0ff" />
          <Stop offset="62%" stopColor="#0066aa" />
          <Stop offset="95%" stopColor="#001624" />
        </RadialGradient>
        <RadialGradient id="xoreShine" cx="30%" cy="22%" rx="38%" ry="38%">
          <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
          <Stop offset="55%" stopColor="#ffffff" stopOpacity={0.08} />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="48" fill="url(#xoreCore)" />
      <Circle cx="50" cy="50" r="48" fill="url(#xoreShine)" />
      {glow && <Circle cx="50" cy="50" r="48" fill="none" stroke="#00e0ff" strokeOpacity={0.35} strokeWidth={1} />}
      {showLabel && (
        <SvgText
          x="50"
          y="57"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="#ffffff"
          letterSpacing="2"
          opacity={0.92}
        >
          XORE
        </SvgText>
      )}
    </Svg>
  );
};
