# Arquitectura prevista

SmartPosPro no debe contener secretos del servidor.

Flujo:
1. SmartPosPro obtiene un identificador de instalación.
2. El usuario introduce el código de licencia.
3. SmartPosPro llama al endpoint de activación.
4. El servidor valida estado, vencimiento y equipos.
5. El servidor registra la activación.
6. El servidor entrega una autorización firmada.
7. SmartPosPro guarda localmente la autorización.
8. Periódicamente realiza una validación.
9. Si falla Internet temporalmente, trabaja dentro del período de gracia.
10. Si la licencia está suspendida, cancelada o vencida y termina el período permitido, la aplicación limita la operación.

La clave privada de firma debe existir solamente en el servidor.

Productos futuros:
- SmartPosPro
- Alis ERP Cloud
- SmartTransPro
- Otros productos de ALIS Software
