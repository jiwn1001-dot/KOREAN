import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: '모의전 정보조회 시스템',
  description: '모의전 국가별 정보를 관리하고 조회하는 웹 애플리케이션',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <Navbar />
        <div className="page-wrapper">
          {children}
        </div>
      </body>
    </html>
  );
}
