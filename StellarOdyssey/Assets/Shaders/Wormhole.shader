// Wormhole mouth: fake gravitational lensing via grab-pass distortion +
// Doppler-tinted accretion disk + event-horizon fresnel glow.
// (For HDRP, port the fragment logic into a ShaderGraph with an HD Scene Color
// node — this ShaderLab version is the Built-in/URP reference implementation.)
Shader "StellarOdyssey/Wormhole"
{
    Properties
    {
        _DistortionStrength ("Lensing Strength", Range(0, 2)) = 0.85
        _DiskColorInner ("Accretion Inner", Color) = (1.0, 0.85, 0.4, 1)
        _DiskColorOuter ("Accretion Outer", Color) = (0.35, 0.15, 0.9, 1)
        _SwirlSpeed ("Swirl Speed", Float) = 1.6
        _HorizonColor ("Horizon Glow", Color) = (0.55, 0.8, 1.0, 1)
        _NoiseTex ("Noise", 2D) = "gray" {}
    }
    SubShader
    {
        Tags { "Queue" = "Transparent+50" "RenderType" = "Transparent" }
        GrabPass { "_WormholeGrab" }

        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _WormholeGrab;
            sampler2D _NoiseTex;
            float _DistortionStrength, _SwirlSpeed;
            float4 _DiskColorInner, _DiskColorOuter, _HorizonColor;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float4 grabUV : TEXCOORD0;
                float3 viewDir : TEXCOORD1;
                float3 normal : TEXCOORD2;
                float3 objPos : TEXCOORD3;
            };

            v2f vert(appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.grabUV = ComputeGrabScreenPos(o.pos);
                o.viewDir = normalize(WorldSpaceViewDir(v.vertex));
                o.normal = UnityObjectToWorldNormal(v.normal);
                o.objPos = v.vertex.xyz;
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float fresnel = 1.0 - saturate(dot(normalize(i.viewDir), normalize(i.normal)));

                // Gravitational lensing: pull background UVs toward the centre,
                // strongest at the rim (photon-sphere look).
                float2 screenUV = i.grabUV.xy / i.grabUV.w;
                float2 toCenter = screenUV - 0.5;
                float lens = pow(fresnel, 2.0) * _DistortionStrength;
                float3 bg = tex2D(_WormholeGrab, screenUV - toCenter * lens).rgb;

                // Swirling accretion disk in object-space polar coords.
                float2 p = i.objPos.xy;
                float radius = length(p);
                float angle = atan2(p.y, p.x);
                float swirl = angle + _Time.y * _SwirlSpeed + radius * 9.0;
                float band = tex2D(_NoiseTex, float2(swirl * 0.159, radius * 2.0)).r;
                float diskMask = smoothstep(0.25, 0.5, radius) * smoothstep(1.0, 0.7, radius);
                float3 disk = lerp(_DiskColorInner.rgb, _DiskColorOuter.rgb, radius) * band * diskMask * 4.0;

                // Blue-shifted approaching side, red-shifted receding (relativistic beaming).
                float doppler = sin(angle + _Time.y * _SwirlSpeed);
                disk *= lerp(float3(1.3, 1.1, 0.8), float3(0.8, 0.9, 1.4), doppler * 0.5 + 0.5);

                // Event-horizon core swallows the background.
                float core = smoothstep(0.35, 0.15, radius);
                bg = lerp(bg, float3(0, 0, 0), core);

                float3 col = bg + disk + _HorizonColor.rgb * pow(fresnel, 4.0) * 3.0;
                return float4(col, 1.0);
            }
            ENDCG
        }
    }
}
