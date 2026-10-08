# GuestQR Staff Flutter app

This Android-first Flutter scaffold uses the existing GuestQR API:

- `POST /api/v1/auth/login` for secure JWT login.
- Socket.io with `auth.token` for tenant- and role-validated order/service events.
- Secure token storage via `flutter_secure_storage`.
- `image_picker` is included for request/proof photos.
- `firebase_messaging` is included for push-notification integration.

Run with:

```sh
flutter pub get
flutter run --dart-define=GUESTQR_API=http://10.0.2.2:4000/api/v1
```

The Flutter SDK is not installed in the current development environment, so this
project is provided as a portable scaffold and should be validated on an Android
toolchain/CI runner.
