// Single-scattering Rayleigh + Mie atmosphere shell (Sean O'Neil / Nishita
// style, real-time ray-marched). Render on an inverted sphere slightly larger
// than the planet. In HDRP prefer the built-in Physically Based Sky per planet;
// this shader is the portable reference used for URP / the scaled-space layer.
Shader "StellarOdyssey/AtmosphereScattering"
{
    Properties
    {
        _PlanetRadius ("Planet Radius", Float) = 6371000
        _AtmosphereRadius ("Atmosphere Radius", Float) = 6471000
        _SunDir ("Sun Direction", Vector) = (1, 0, 0, 0)
        _RayleighCoeff ("Rayleigh RGB", Vector) = (5.8, 13.5, 33.1, 0) // x1e-6, Earth
        _MieCoeff ("Mie", Float) = 21.0
        _SunIntensity ("Sun Intensity", Float) = 22.0
    }
    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" }
        Pass
        {
            Blend One One          // additive scattering over the scene
            ZWrite Off
            Cull Front             // render the inside of the shell

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            #define IN_SCATTER_STEPS 16
            #define DENSITY_STEPS 8

            float _PlanetRadius, _AtmosphereRadius, _MieCoeff, _SunIntensity;
            float4 _SunDir, _RayleighCoeff;

            struct v2f { float4 pos : SV_POSITION; float3 worldPos : TEXCOORD0; };

            v2f vert(appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                return o;
            }

            // Ray-sphere intersection; returns near/far t or (-1,-1).
            float2 raySphere(float3 ro, float3 rd, float3 c, float r)
            {
                float3 oc = ro - c;
                float b = dot(oc, rd);
                float disc = b * b - (dot(oc, oc) - r * r);
                if (disc < 0) return float2(-1, -1);
                float s = sqrt(disc);
                return float2(-b - s, -b + s);
            }

            float densityAt(float3 p, float3 center, float scaleHeight)
            {
                float h = length(p - center) - _PlanetRadius;
                return exp(-max(h, 0.0) / scaleHeight);
            }

            float opticalDepth(float3 from, float3 dir, float dist, float3 center, float scaleHeight)
            {
                float step = dist / DENSITY_STEPS;
                float depth = 0;
                for (int i = 0; i < DENSITY_STEPS; i++)
                    depth += densityAt(from + dir * (i + 0.5) * step, center, scaleHeight) * step;
                return depth;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 center = mul(unity_ObjectToWorld, float4(0, 0, 0, 1)).xyz;
                float3 ro = _WorldSpaceCameraPos;
                float3 rd = normalize(i.worldPos - ro);
                float3 sunDir = normalize(_SunDir.xyz);

                float2 hit = raySphere(ro, rd, center, _AtmosphereRadius);
                if (hit.y < 0) discard;
                float2 ground = raySphere(ro, rd, center, _PlanetRadius);

                float tNear = max(hit.x, 0.0);
                float tFar = ground.x > 0 ? ground.x : hit.y;
                float pathLen = tFar - tNear;
                if (pathLen <= 0) discard;

                float scaleHeightR = (_AtmosphereRadius - _PlanetRadius) * 0.085;
                float scaleHeightM = scaleHeightR * 0.15;
                float3 betaR = _RayleighCoeff.xyz * 1e-6;
                float betaM = _MieCoeff * 1e-6;

                float step = pathLen / IN_SCATTER_STEPS;
                float3 sumR = 0; float sumM = 0;
                float odR = 0, odM = 0;

                for (int s = 0; s < IN_SCATTER_STEPS; s++)
                {
                    float3 p = ro + rd * (tNear + (s + 0.5) * step);
                    float dR = densityAt(p, center, scaleHeightR) * step;
                    float dM = densityAt(p, center, scaleHeightM) * step;
                    odR += dR; odM += dM;

                    float2 sunHit = raySphere(p, sunDir, center, _AtmosphereRadius);
                    float sunOdR = opticalDepth(p, sunDir, sunHit.y, center, scaleHeightR);
                    float sunOdM = opticalDepth(p, sunDir, sunHit.y, center, scaleHeightM);

                    float3 trans = exp(-betaR * (odR + sunOdR) - betaM * 1.1 * (odM + sunOdM));
                    sumR += dR * trans;
                    sumM += dM * trans.x;
                }

                float mu = dot(rd, sunDir);
                float phaseR = 3.0 / (16.0 * UNITY_PI) * (1.0 + mu * mu);
                float g = 0.76;
                float phaseM = 3.0 / (8.0 * UNITY_PI) * ((1.0 - g * g) * (1.0 + mu * mu))
                             / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));

                float3 col = _SunIntensity * (sumR * betaR * phaseR + sumM * betaM * phaseM);
                return float4(col, 1.0);
            }
            ENDCG
        }
    }
}
