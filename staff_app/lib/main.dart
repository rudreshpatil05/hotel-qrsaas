import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as io;

const apiBase = String.fromEnvironment('GUESTQR_API', defaultValue: 'http://10.0.2.2:4000/api/v1');
const socketBase = String.fromEnvironment('GUESTQR_SOCKET', defaultValue: 'http://10.0.2.2:4000');
const storage = FlutterSecureStorage();

void main() => runApp(const GuestQrStaffApp());

class GuestQrStaffApp extends StatelessWidget {
  const GuestQrStaffApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'GuestQR Staff',
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff252b21)), useMaterial3: true),
        home: const LoginPage(),
      );
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  String? error;
  Future<void> login() async {
    setState(() { busy = true; error = null; });
    try {
      final response = await http.post(Uri.parse('$apiBase/auth/login'), headers: {'content-type': 'application/json'}, body: jsonEncode({'email': email.text.trim(), 'password': password.text}));
      if (response.statusCode >= 300) throw Exception('Invalid credentials');
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      await storage.write(key: 'accessToken', value: data['accessToken'] as String);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => StaffHome(token: data['accessToken'] as String)));
    } catch (e) { setState(() => error = e.toString()); } finally { if (mounted) setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('GuestQR Staff')), body: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
    TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')), TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
    if (error != null) Text(error!, style: const TextStyle(color: Colors.red)), const SizedBox(height: 16), FilledButton(onPressed: busy ? null : login, child: Text(busy ? 'Signing in…' : 'Sign in'))
  ])));
}

class StaffHome extends StatefulWidget {
  const StaffHome({required this.token, super.key});
  final String token;
  @override
  State<StaffHome> createState() => _StaffHomeState();
}

class _StaffHomeState extends State<StaffHome> {
  late final io.Socket socket;
  final List<String> notifications = [];
  @override
  void initState() { super.initState(); socket = io.io(socketBase, io.OptionBuilder().setTransports(['websocket']).setAuth({'token': widget.token}).enableAutoConnect().build()); socket.on('order-created', (_) => setState(() => notifications.insert(0, 'New kitchen order'))); socket.on('service-request-created', (_) => setState(() => notifications.insert(0, 'New service request'))); }
  @override
  void dispose() { socket.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Staff operations')), body: ListView(padding: const EdgeInsets.all(16), children: [
    Card(child: ListTile(leading: const Icon(Icons.restaurant), title: const Text('Kitchen orders'), subtitle: const Text('Live order notifications and status updates'))),
    Card(child: ListTile(leading: const Icon(Icons.room_service), title: const Text('Service requests'), subtitle: const Text('Accept, reject and complete guest requests'))),
    if (notifications.isNotEmpty) ...[const Text('Notifications', style: TextStyle(fontWeight: FontWeight.bold)), ...notifications.map((item) => ListTile(dense: true, leading: const Icon(Icons.notifications), title: Text(item)))]
  ]));
}
