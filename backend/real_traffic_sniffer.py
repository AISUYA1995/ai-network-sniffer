import time
import threading
import json
import os
from collections import defaultdict
from datetime import datetime, timedelta
from dotenv import load_dotenv
try:
    import requests
except ImportError:
    print("Error: Library 'requests' is not installed.")
    print("Please install it using: pip install requests")
    exit(1)

try:
    from scapy.all import sniff, IP, TCP, UDP
except ImportError:
    print("Error: Library 'scapy' is not installed.")
    print("Please install it using: pip install scapy")
    exit(1)

try:
    import google.generativeai as genai
except ImportError:
    print("Error: Library 'google-generativeai' is not installed.")
    print("Please install it using: pip install google-generativeai")
    exit(1)

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.cloud import firestore as google_firestore
except ImportError:
    print("Error: Library 'firebase-admin' is not installed.")
    print("Please install it using: pip install firebase-admin")
    exit(1)

# ==========================================
# การตั้งค่า API และ Firebase
# ==========================================
# 1. ตั้งค่า API Key ของ Gemini
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "") # เปลี่ยนเป็น API Key ของคุณ
if GEMINI_API_KEY != "":
    genai.configure(api_key=GEMINI_API_KEY)

# 2. ตั้งค่าการเชื่อมต่อ Firebase
FIREBASE_CREDENTIALS_PATH = "firebase-key.json" # เปลี่ยน Path ให้ตรงกับไฟล์ Service Account

try:
    cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("[*] เชื่อมต่อ Firebase สำเร็จ")
except Exception as e:
    print(f"[!] ไม่สามารถเชื่อมต่อ Firebase ได้ (รอการตั้งค่า {FIREBASE_CREDENTIALS_PATH})")
    db = None
# ==========================================

traffic_summary = defaultdict(int)
ip_ports_tracker = defaultdict(set)
ip_packet_tracker = defaultdict(int)
lock = threading.Lock()

def process_packet(packet):
    """
    ฟังก์ชัน Callback ที่จะถูกเรียกใช้ทุกครั้งที่ดักจับแพ็กเก็ตได้
    """
    try:
        # ตรวจสอบว่ามีชั้น IP (IP Layer) หรือไม่
        if IP in packet:
            src_ip = packet[IP].src
            dst_ip = packet[IP].dst
            
            dst_port = None
            protocol = None
            
            # ดึงข้อมูลพอร์ตและโปรโตคอลเฉพาะ TCP และ UDP
            if TCP in packet:
                dst_port = packet[TCP].dport
                protocol = "TCP"
            elif UDP in packet:
                dst_port = packet[UDP].dport
                protocol = "UDP"
            
            # รวบรวมข้อมูลหากพบ TCP/UDP 
            if dst_port is not None and protocol is not None:
                key = (src_ip, dst_ip, dst_port, protocol)
                
                trigger_emergency = False
                emergency_data = []
                
                # ใช้ Lock เพื่อความปลอดภัยเมื่อแก้ไขตัวแปรที่ใช้ร่วมกับ Thread อื่น
                with lock:
                    traffic_summary[key] += 1
                    ip_ports_tracker[src_ip].add(dst_port)
                    ip_packet_tracker[src_ip] += 1
                    
                    # ตรวจสอบเงื่อนไขฉุกเฉิน (Threshold)
                    if len(ip_ports_tracker[src_ip]) > 10 or ip_packet_tracker[src_ip] > 30:
                        trigger_emergency = True
                        
                        # ดึงข้อมูลของ IP นี้ออกมาจาก Buffer
                        keys_to_remove = []
                        for k, count in traffic_summary.items():
                            if k[0] == src_ip:
                                emergency_data.append({
                                    "source_ip": k[0],
                                    "destination_ip": k[1],
                                    "port": k[2],
                                    "protocol": k[3],
                                    "packet_count": count
                                })
                                keys_to_remove.append(k)
                        
                        # เคลียร์ข้อมูลออกจาก Buffer หลักทันทีเพื่อไม่ให้วิเคราะห์ซ้ำ
                        for k in keys_to_remove:
                            del traffic_summary[k]
                        if src_ip in ip_ports_tracker:
                            del ip_ports_tracker[src_ip]
                        if src_ip in ip_packet_tracker:
                            del ip_packet_tracker[src_ip]
                            
                # หากเข้าเงื่อนไขฉุกเฉิน ให้แยก Thread ทำงานทันที
                if trigger_emergency and emergency_data:
                    threading.Thread(
                        target=process_single_ip_emergency,
                        args=(src_ip, emergency_data),
                        daemon=True
                    ).start()
    except Exception:
        # ข้ามแพ็กเก็ตที่อ่านไม่ได้หรือมีรูปแบบผิดปกติ
        pass

def process_single_ip_emergency(source_ip, traffic_list):
    """
    วิเคราะห์ IP แบบฉุกเฉินทันทีเมื่อเข้าเงื่อนไข Threshold
    """
    print(f"\n[!] 🚨 EMERGENCY TRIGGER 🚨: ตรวจพบพฤติกรรมน่าสงสัยจาก IP {source_ip} กำลังส่งวิเคราะห์ทันที!")
    
    suspicious_traffic = {source_ip: traffic_list}
    ai_results = analyze_traffic_with_ai(suspicious_traffic)
    
    if ai_results and isinstance(ai_results, list):
        for res in ai_results:
            res_source_ip = res.get("source_ip")
            risk_level = res.get("risk_level", "Low")
            
            if res_source_ip:
                print(f"[*] ผลวิเคราะห์ AI ฉุกเฉิน (IP {res_source_ip}): {res}")
                save_to_firebase(res_source_ip, res)
                
                # ส่งแจ้งเตือน Telegram เฉพาะระดับ High และ Medium
                if risk_level in ["High", "Medium"]:
                    send_telegram_alert(res_source_ip, risk_level, res.get("description", "No description provided"))
    else:
        print(f"[*] (Mock/Fallback) สร้างข้อมูลจำลองฉุกเฉินสำหรับ IP {source_ip}")
        total_packets = sum(item["packet_count"] for item in traffic_list)
        mock_result = {
            "risk_level": "High",
            "description": f"AI Detected (Mock): พฤติกรรมเข้าข่ายโจมตีอย่างรุนแรง ({total_packets} packets) จากการสแกนพอร์ตหรือยิงรัว"
        }
        save_to_firebase(source_ip, mock_result)
        send_telegram_alert(source_ip, mock_result["risk_level"], mock_result["description"])

def analyze_traffic_with_ai(traffic_data):
    """
    ส่วนที่ 1: ส่งข้อมูลรวมของทุก IP ให้ AI วิเคราะห์ในครั้งเดียว
    """
    if GEMINI_API_KEY == "" or GEMINI_API_KEY == "YOUR_GEMINI_API_KEY":
        print("[!] ข้ามการวิเคราะห์ด้วย AI เนื่องจากยังไม่ได้ระบุ GEMINI_API_KEY")
        return None
        
    prompt = (
        f"คุณคือผู้เชี่ยวชาญด้าน Network Security จงวิเคราะห์ข้อมูล Network Traffic ต่อไปนี้ "
        f"ข้อมูลถูกจัดกลุ่มตาม Source IP จงวิเคราะห์ว่า Source IP ใดมีพฤติกรรมน่าสงสัยหรือมีความพยายามโจมตี (เช่น Port Scan, DDoS) "
        f"ให้ตอบกลับเป็น JSON Array โดยแต่ละ Object ใน Array ต้องมี key: "
        f"'source_ip' (IP ต้นทาง), 'risk_level' (High/Medium/Low/Normal), และ 'description' (คำอธิบายสั้นๆ)\n"
        f"ข้อมูล: {json.dumps(traffic_data)}\n"
        f"ตอบกลับเฉพาะโครงสร้าง JSON Array เท่านั้น ห้ามพิมพ์ข้อความอื่น"
    )
    
    try:
        model = genai.GenerativeModel('gemini-3.5-flash-lite')
        response = model.generate_content(prompt)
        
        response_text = response.text.strip()
        
        print(f"\n[DEBUG] Raw AI Response:\n{response_text}\n")
        
        # จัดการกรณี AI ตอบกลับมามี Markdown Block
        if response_text.startswith("```json"):
            response_text = response_text[7:-3].strip()
        elif response_text.startswith("```"):
            response_text = response_text[3:-3].strip()
            
        return json.loads(response_text)
    except Exception as e:
        print(f"[!] เกิดข้อผิดพลาดในการวิเคราะห์ด้วย AI: {e}")
        return None

def save_to_firebase(source_ip, ai_result):
    """
    ส่วนที่ 2: บันทึกผลลัพธ์ลง Firebase (ใช้วิธี Upsert และนับจำนวน Hit)
    """
    if db is None:
        return
        
    try:
        doc_ref = db.collection("network_alerts").document(source_ip)
        
        # ข้อมูลที่จะทำการ Upsert
        # ใช้ google_firestore.Increment(1) เพื่อนับจำนวนสะสม
        alert_doc = {
            "timestamp": datetime.now().isoformat(),  # เวลาที่ตรวจเจอครั้งแรกล่าสุด หรือไว้ใช้อ้างอิง
            "last_seen": datetime.now().isoformat(),  # เวลาที่ตรวจเจอครั้งล่าสุดจริงๆ (สำหรับ Cleanup)
            "source": source_ip,
            "risk_level": ai_result.get("risk_level", "Unknown"),
            "description": ai_result.get("description", "No description provided"),
            "total_alerts": google_firestore.Increment(1)
        }
        
        # ส่งขึ้น Firestore ด้วย .set(..., merge=True)
        print(f"[DEBUG] กำลังเตรียม Upsert ข้อมูลของ {source_ip} ขึ้น Firebase...")
        doc_ref.set(alert_doc, merge=True)
        print(f"[DEBUG] อัปโหลดสำเร็จ! (Source IP: {source_ip}, Risk: {ai_result.get('risk_level')})")
    except Exception as e:
        print(f"[DEBUG ERROR] เกิดข้อผิดพลาดในการอัปโหลดลง Firebase: {e}")

def cleanup_old_alerts(hours_inactive=1):
    """
    ส่วนเสริม: ลบ Document ของ IP ที่ไม่มีความเคลื่อนไหวเกินระยะเวลาที่กำหนด
    """
    if db is None:
        return
        
    try:
        # คำนวณเวลา cut-off (เช่น 1 ชั่วโมงที่แล้ว)
        cutoff_time = (datetime.now() - timedelta(hours=hours_inactive)).isoformat()
        
        # ค้นหา Document ที่ last_seen เก่ากว่า cutoff_time
        alerts_ref = db.collection("network_alerts")
        old_alerts = alerts_ref.where("last_seen", "<", cutoff_time).stream()
        
        deleted_count = 0
        for doc in old_alerts:
            doc.reference.delete()
            deleted_count += 1
            
        if deleted_count > 0:
            print(f"[DEBUG] 🧹 Cleanup: ลบข้อมูล IP เก่าที่ไม่มีการเคลื่อนไหวสำเร็จจำนวน {deleted_count} รายการ")
    except Exception as e:
        print(f"[DEBUG ERROR] เกิดข้อผิดพลาดในการลบข้อมูลเก่า: {e}")

def send_telegram_alert(source_ip, risk_level, description):
    """
    ส่งการแจ้งเตือนผ่าน Telegram เมื่อพบความเสี่ยง
    """
    load_dotenv()
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    
    if not bot_token or not chat_id:
        return
        
    emoji = "🚨" if risk_level == "High" else "⚠️"
    
    message = (
        f"{emoji} <b>Network Security Alert</b> {emoji}\n\n"
        f"<b>Source IP:</b> {source_ip}\n"
        f"<b>Risk Level:</b> {risk_level}\n"
        f"<b>Description:</b>\n{description}"
    )
    
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code == 200:
            print(f"[DEBUG] 📤 ส่งแจ้งเตือน Telegram สำเร็จ (IP: {source_ip})")
        else:
            print(f"[DEBUG ERROR] ส่งแจ้งเตือน Telegram ไม่สำเร็จ (Status: {response.status_code}): {response.text}")
    except Exception as e:
        print(f"[DEBUG ERROR] เกิดข้อผิดพลาดในการเชื่อมต่อ Telegram API: {e}")

def process_and_reset_summary():
    """
    ฟังก์ชันที่ทำงานเบื้องหลัง (Background Thread) เพื่อพิมพ์สรุปผลและให้ AI ตรวจสอบ
    """
    global traffic_summary, ip_ports_tracker, ip_packet_tracker
    
    while True:
        time.sleep(15) # สรุปผลทุกๆ 15 วินาที
        
        with lock:
            if not traffic_summary:
                print(f"[{time.strftime('%X')}] ไม่มี Traffic ปกติใน 15 วินาทีที่ผ่านมา...")
                ip_ports_tracker.clear()
                ip_packet_tracker.clear()
                continue
                
            print(f"\n[{time.strftime('%X')}] --- สรุปข้อมูล Network Traffic รอบปกติ (15 วินาทีล่าสุด) ---")
            
            results = []
            for (src, dst, port, proto), count in traffic_summary.items():
                results.append({
                    "source_ip": src,
                    "destination_ip": dst,
                    "port": port,
                    "protocol": proto,
                    "packet_count": count
                })
                
            # ล้างข้อมูลเดิมสำหรับรอบถัดไป
            traffic_summary.clear()
            ip_ports_tracker.clear()
            ip_packet_tracker.clear()
            
        # การเรียงลำดับและพิมพ์ 
        results.sort(key=lambda x: x["packet_count"], reverse=True)
        for item in results:
            print(item)
        print("-" * 60)
        
        # รัน Cleanup ข้อมูลเก่า (เช่น ทุกๆ รอบที่สรุปผล)
        cleanup_old_alerts(hours_inactive=1)
        
        # จัดกลุ่มข้อมูลตาม Source IP เพื่อเตรียมส่งให้ AI
        grouped_by_source = defaultdict(list)
        for item in results:
            grouped_by_source[item["source_ip"]].append(item)
            
        # คัดกรอง IP ที่มีจำนวนแพ็กเก็ตเกินเกณฑ์ (เช่น 10) เพื่อลดขนาดข้อมูล
        suspicious_traffic = {}
        for source_ip, data in grouped_by_source.items():
            total_packets = sum(item["packet_count"] for item in data)
            if total_packets >= 10:
                suspicious_traffic[source_ip] = data
                
        if suspicious_traffic:
            print(f"[*] ส่งข้อมูล Traffic รวมของ {len(suspicious_traffic)} IP ให้ AI วิเคราะห์ในครั้งเดียว...")
            ai_results = analyze_traffic_with_ai(suspicious_traffic)
            
            if ai_results and isinstance(ai_results, list):
                # AI ตอบกลับมาเป็น List ของแต่ละ IP
                for res in ai_results:
                    source_ip = res.get("source_ip")
                    risk_level = res.get("risk_level", "Low")
                    
                    if source_ip: # ปลดล็อกเงื่อนไขให้ส่งข้อมูลขึ้น Firebase ทุกระดับความเสี่ยงเพื่อทดสอบ
                        print(f"[*] ผลวิเคราะห์ AI (IP {source_ip}): {res}")
                        save_to_firebase(source_ip, res)
                        
                        # ส่งแจ้งเตือน Telegram เฉพาะระดับ High และ Medium
                        if risk_level in ["High", "Medium"]:
                            send_telegram_alert(source_ip, risk_level, res.get("description", "No description provided"))
            else:
                # Mock Data Fallback ในกรณีที่ไม่ได้ใส่ API Key หรือ AI ตอบกลับผิดพลาด
                print("[*] (Mock/Fallback) สร้างข้อมูลจำลองเพื่ออัปเดตหน้า Dashboard")
                for source_ip, data in suspicious_traffic.items():
                    total_packets = sum(item["packet_count"] for item in data)
                    mock_result = {
                        "risk_level": "High" if total_packets > 50 else "Medium",
                        "description": f"AI Detected (Mock): ตรวจพบความถี่การเชื่อมต่อสูง ({total_packets} packets) ภายใน 30 วินาที"
                    }
                    save_to_firebase(source_ip, mock_result)
                    
                    # ส่งแจ้งเตือน Telegram เฉพาะระดับ High และ Medium สำหรับ Mock Data
                    mock_risk = mock_result.get("risk_level")
                    if mock_risk in ["High", "Medium"]:
                        send_telegram_alert(source_ip, mock_risk, mock_result.get("description", ""))

def main():
    print("[*] เริ่มการทำงาน: Real-time Network Traffic Sniffer (AI & Firebase Integrated)")
    print("[*] กดปุ่ม Ctrl+C เพื่อหยุดการทำงาน")
    print("-" * 60)
    
    printer_thread = threading.Thread(target=process_and_reset_summary, daemon=True)
    printer_thread.start()
    
    try:
        sniff(prn=process_packet, store=False)
    except KeyboardInterrupt:
        print("\n[*] ได้รับคำสั่ง Ctrl+C: กำลังหยุดการดักจับแพ็กเก็ต...")
    except PermissionError:
        print("\n[!] Error: ไม่มีสิทธิ์เข้าถึง Network Interface")
        print("[!] กรุณารันสคริปต์ด้วยสิทธิ์ Administrator (Windows) หรือ sudo (Linux/macOS)")
    except Exception as e:
        print(f"\n[!] เกิดข้อผิดพลาด: {e}")

if __name__ == "__main__":
    main()
