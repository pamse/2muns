import { ImageResponse } from 'next/og';

// 아이콘 크기 및 메타데이터 설정 (512x512 고화질)
export const size = {
  width: 512,
  height: 512,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #0d1117 0%, #161b22 100%)',
          borderRadius: '110px',
        }}
      >
        {/* 2müns 로고 텍스트 & 포인트 */}
        <div
          style={{
            display: 'flex',
            fontSize: '110px',
            fontWeight: 'bold',
            fontFamily: 'sans-serif',
            color: '#ffffff',
            letterSpacing: '-2px',
          }}
        >
          2m<span style={{ color: '#00e599' }}>ü</span>ns
        </div>
        <div
          style={{
            marginTop: '8px',
            fontSize: '28px',
            fontWeight: '600',
            color: '#00e599',
            letterSpacing: '4px',
            textTransform: 'uppercase',
          }}
        >
          66 Days
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}import { ImageResponse } from 'next/og';

// 아이콘 크기 및 메타데이터 설정 (512x512 고화질)
export const size = {
  width: 512,
  height: 512,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #0d1117 0%, #161b22 100%)',
          borderRadius: '110px',
        }}
      >
        {/* 2müns 로고 텍스트 & 포인트 */}
        <div
          style={{
            display: 'flex',
            fontSize: '110px',
            fontWeight: 'bold',
            fontFamily: 'sans-serif',
            color: '#ffffff',
            letterSpacing: '-2px',
          }}
        >
          2m<span style={{ color: '#00e599' }}>ü</span>ns
        </div>
        <div
          style={{
            marginTop: '8px',
            fontSize: '28px',
            fontWeight: '600',
            color: '#00e599',
            letterSpacing: '4px',
            textTransform: 'uppercase',
          }}
        >
          66 Days
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}