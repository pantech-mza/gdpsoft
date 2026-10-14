import './styles.css';

export const metadata = {
  title: 'GDPSalud',
  description: 'Plataforma de gestión de Grupo Del Plata Salud'
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
