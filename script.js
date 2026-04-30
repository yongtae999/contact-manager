// 상태 관리
let contacts = [];

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    loadContacts();
    renderContacts();
});

// 연락처 로컬 스토리지에서 불러오기
function loadContacts() {
    const saved = localStorage.getItem('kowaps_contacts');
    if (saved) {
        contacts = JSON.parse(saved);
    }
}

// 연락처 로컬 스토리지에 저장하기
function saveToLocal() {
    localStorage.setItem('kowaps_contacts', JSON.stringify(contacts));
}

// ========== Google Cloud Vision API 키 ==========
const VISION_API_KEY = 'AIzaSyBr7TzIPVuw5f2s9S4owzEKKJh92_ohFzU';

// 명함 이미지 업로드 및 OCR 처리 (Google Cloud Vision API)
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('loadingOverlay').style.display = 'flex';

    try {
        // 1단계: 이미지를 Base64로 변환
        const base64Image = await fileToBase64(file);

        // 2단계: Google Cloud Vision API 호출
        const response = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requests: [{
                        image: { content: base64Image },
                        features: [{ type: 'TEXT_DETECTION' }]
                    }]
                })
            }
        );

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }

        const text = data.responses[0]?.fullTextAnnotation?.text || '';
        console.log("=== Google Vision OCR 결과 ===\n", text);

        if (!text) {
            alert('명함에서 글자를 찾을 수 없습니다. 직접 입력해주세요.');
            openFormModal();
            return;
        }

        parseBusinessCard(text);
        
    } catch (error) {
        console.error('Vision API Error:', error);
        alert('명함 인식 중 오류가 발생했습니다. 직접 입력해주세요.');
        openFormModal();
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
        event.target.value = '';
    }
}

// 파일을 Base64 문자열로 변환
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // data:image/jpeg;base64, 부분을 제거하고 순수 base64만 추출
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ========== OCR 텍스트 파싱 ==========
function parseBusinessCard(text) {
    let name = "";
    let phone = "";
    let tel = "";
    let email = "";
    let org = "";
    let title = "";
    let address = "";

    // ---- 이메일 우선 추출 ----
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

    // ---- 텍스트에서 각 필드 추출 ----
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // 전화번호 정규식 (숫자 사이의 공백이나 특수문자 포괄적으로 처리)
    const phoneRegex = /(010|011|016|017|018|019)[\s\-\.]*\d{3,4}[\s\-\.]*\d{4}/;
    const telRegex = /(02|0[3-6][1-5]|070|050[2-7]|0[8-9]0)[\s\-\.]*\d{3,4}[\s\-\.]*\d{4}/;
    
    // 주소 키워드
    const addrKeywords = ['특별시','광역시','자치시','자치도','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주','서울','부산','대구','인천','광주','대전','울산'];
    const addrSuffixes = ['도','시','군','구','읍','면','동','리','로','길','대로','번길','가'];
    
    // 이름/주소가 아닌 것으로 분류할 키워드
    const skipForName = ['이메일','팩스','전화','모바일','주소','직통','본부','지부','지회','협회','환경','대한','민국','센터','사무','번호','명함','기관','야생','관리','텔레','인터넷','홈페이지','우편','사업자','카카오','법인','등록','www','http','@','fax','tel','e-mail','mail','phone','mobile','add','홍보','기획','총무','교육','대표번호'];
    
    // 소속 키워드
    const orgKeywords = ['협회','지부','환경청','센터','공사','공단','재단','연구원','연구소','대학','학교','병원','은행','(주)','주식회사','유한회사','법인','기관','청','부','처','원','실','과','팀','단'];
    
    // 직급 키워드
    const titleKeywords = ['회장','부회장','이사장','이사','감사','지부장','국장','본부장','부장','차장','과장','대리','주임','사원','대표','소장','팀장','연구원','실장','센터장','관장','교수','박사','원장','처장','계장','주사','서기','사무관','사무국장','총무'];

    // 한국인 성씨 (인식률 관계없이 패턴 매칭용)
    const koreanSurnames = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','전','홍','유','류','고','문','양','손','배','백','허','남','심','노','하','곽','성','차','주','우','구','나','민','진','지','엄','채','원','천','방','공','현','함','변','염','여','추','도','소','석','선','설','마','길','연','위','표','명','기','반','왕','금','옥','육','인','맹','제','모','탁','국','어','은','편','용','남궁','황보','제갈','사공','선우','독고'];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // 휴대폰 추출
        if (!phone) {
            const phoneMatch = line.match(phoneRegex);
            if (phoneMatch) {
                phone = phoneMatch[0].replace(/[^0-9]/g, '');
                if(phone.length === 11) phone = phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
                else if(phone.length === 10) phone = phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
                continue;
            }
        }

        // 일반전화 추출
        if (!tel) {
            const telMatch = line.match(telRegex);
            if (telMatch) {
                tel = telMatch[0].replace(/[^0-9]/g, '');
                if (tel.startsWith('02')) {
                    if(tel.length === 9) tel = tel.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
                    else tel = tel.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
                } else {
                    if(tel.length === 10) tel = tel.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
                    else tel = tel.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
                }
                continue;
            }
        }

        // 이메일 (한국어 결과에서도 시도)
        if (!email) {
            const emailMatch = line.match(emailRegex);
            if (emailMatch) { email = emailMatch[0]; continue; }
        }
        
        // ★ 주소 추출 (대폭 강화)
        if (!address) {
            const lineForAddr = line.replace(/^(주소|Add|Address|addr|우편번호)\s*[:\-\.]?\s*/i, '').trim();
            const hasAddrKeyword = addrKeywords.some(kw => lineForAddr.includes(kw));
            const hasAddrSuffix = addrSuffixes.some(sf => lineForAddr.includes(sf));
            const hasNumber = /\d/.test(lineForAddr);
            
            // 조건: (광역 키워드 포함) 또는 (주소 접미사 2개 이상 + 숫자)
            const suffixCount = addrSuffixes.filter(sf => lineForAddr.includes(sf)).length;
            if ((hasAddrKeyword && lineForAddr.length > 5) || (suffixCount >= 2 && hasNumber && lineForAddr.length > 6)) {
                address = lineForAddr;
                continue;
            }
        }

        // 소속 유추
        if (!org) {
            if (orgKeywords.some(kw => line.includes(kw)) && line.length <= 30) {
                org = line;
            }
        }

        // ★ 직급 유추 (상위에 정의된 titleKeywords 사용)
        for (let tk of titleKeywords) {
            if (line.includes(tk) && !title) {
                title = tk;
                // 직급과 이름이 한 줄에 있는 경우 (예: "홍길동 지부장", "지부장 홍길동")
                let possibleName = line.replace(tk, '').replace(/[^가-힣]/g, '').trim();
                if (possibleName.length >= 2 && possibleName.length <= 4) {
                    // 소속/주소 관련 단어가 아닌지 확인
                    const isNotName = skipForName.some(w => possibleName.includes(w)) || 
                                      orgKeywords.some(w => possibleName.includes(w)) ||
                                      addrKeywords.some(w => possibleName.includes(w));
                    if (!isNotName) {
                        name = possibleName;
                    }
                }
                break;
            }
        }
    }

    // ★ 이름을 못 찾았을 때 더 똑똑하게 추론
    if (!name && lines.length > 0) {
        // 이미 추출된 정보에 해당하는 줄은 건너뛰기
        const usedTexts = [phone, tel, email, org, title, address].filter(v => v);
        
        // 1단계: 성씨 + 2~3글자 매칭 (가장 정확한 방법)
        for (let line of lines) {
            // 이미 다른 필드로 사용된 줄이면 건너뛰기
            if (usedTexts.some(t => line.includes(t))) continue;
            
            // 전화번호, 이메일, 숫자가 포함된 줄 건너뛰기
            if (/\d/.test(line) || /@/.test(line)) continue;
            
            // 제외 키워드가 포함된 줄 건너뛰기
            if (skipForName.some(word => line.toLowerCase().includes(word))) continue;
            if (orgKeywords.some(word => line.includes(word))) continue;
            if (addrKeywords.some(word => line.includes(word))) continue;
            if (addrSuffixes.some(sf => line.includes(sf) && line.length > 5)) continue;
            
            let cleanLine = line.replace(/[^가-힣]/g, '');
            
            if (cleanLine.length >= 2 && cleanLine.length <= 4) {
                let firstChar = cleanLine.charAt(0);
                let firstTwoChars = cleanLine.substring(0, 2);
                if (koreanSurnames.includes(firstTwoChars) || koreanSurnames.includes(firstChar)) {
                    name = cleanLine;
                    break;
                }
            }
        }

        // 2단계: 성씨 매칭 실패 시, 순수 한글 2~3글자 단어 찾기
        if (!name) {
            for (let line of lines) {
                if (usedTexts.some(t => line.includes(t))) continue;
                if (/\d/.test(line) || /@/.test(line)) continue;
                if (skipForName.some(word => line.toLowerCase().includes(word))) continue;
                if (orgKeywords.some(word => line.includes(word))) continue;
                if (addrKeywords.some(word => line.includes(word))) continue;
                if (titleKeywords.some(word => line.includes(word))) continue;
                
                let cleanLine = line.replace(/[^가-힣]/g, '');
                if (cleanLine.length >= 2 && cleanLine.length <= 4) {
                    name = cleanLine;
                    break;
                }
            }
        }
    }

    // 폼 열고 파싱된 데이터 채우기
    openFormModal();
    document.getElementById('orgInput').value = org;
    document.getElementById('titleInput').value = title;
    document.getElementById('nameInput').value = name;
    document.getElementById('phoneInput').value = phone;
    document.getElementById('telInput').value = tel;
    document.getElementById('emailInput').value = email;
    document.getElementById('addressInput').value = address;
    document.getElementById('memoInput').value = '';
    
    // OCR 알림 메시지 표시
    document.getElementById('ocrNotice').style.display = 'block';
}

// UI 헬퍼
function openFormModal(editId = null) {
    const modal = document.getElementById('formModal');
    const form = document.getElementById('contactForm');
    document.getElementById('ocrNotice').style.display = 'none';
    
    if (editId) {
        document.getElementById('modalTitle').innerText = '연락처 수정';
        const contact = contacts.find(c => c.id === editId);
        if (contact) {
            document.getElementById('contactId').value = contact.id;
            document.getElementById('orgInput').value = contact.org;
            document.getElementById('titleInput').value = contact.title;
            document.getElementById('nameInput').value = contact.name;
            document.getElementById('phoneInput').value = contact.phone;
            document.getElementById('telInput').value = contact.tel || '';
            document.getElementById('emailInput').value = contact.email || '';
            document.getElementById('addressInput').value = contact.address || '';
            document.getElementById('memoInput').value = contact.memo || '';
        }
    } else {
        document.getElementById('modalTitle').innerText = '새 연락처 추가';
        form.reset();
        document.getElementById('contactId').value = '';
    }
    
    modal.style.display = 'flex';
}

function closeFormModal() {
    document.getElementById('formModal').style.display = 'none';
}

// 연락처 저장
function saveContact() {
    const id = document.getElementById('contactId').value;
    const name = document.getElementById('nameInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    const tel = document.getElementById('telInput').value.trim();
    const email = document.getElementById('emailInput').value.trim();
    const address = document.getElementById('addressInput').value.trim();
    const org = document.getElementById('orgInput').value.trim();
    const title = document.getElementById('titleInput').value.trim();
    const memo = document.getElementById('memoInput').value.trim();

    if (!name) {
        alert("성명은 필수 입력입니다.");
        return;
    }

    if (id) {
        // 수정
        const index = contacts.findIndex(c => c.id === id);
        if (index > -1) {
            contacts[index] = { id, name, phone, tel, email, address, org, title, memo };
        }
    } else {
        // 신규 추가
        const newContact = {
            id: Date.now().toString(),
            name, phone, tel, email, address, org, title, memo
        };
        contacts.unshift(newContact); // 최신 항목이 위로
    }

    saveToLocal();
    renderContacts();
    closeFormModal();
}

// 연락처 삭제
function deleteContact(id) {
    if (confirm("이 연락처를 삭제하시겠습니까?")) {
        contacts = contacts.filter(c => c.id !== id);
        saveToLocal();
        renderContacts();
    }
}

// 화면에 리스트 그리기
function renderContacts(filterText = '') {
    const listEl = document.getElementById('contactList');
    const countEl = document.getElementById('totalCount');
    
    listEl.innerHTML = '';
    
    const filtered = contacts.filter(c => 
        c.name.includes(filterText) || 
        c.org.includes(filterText) ||
        c.phone.includes(filterText)
    );
    
    countEl.innerText = filtered.length;

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="empty-state">저장된 연락처가 없습니다.</div>`;
        return;
    }

    filtered.forEach(c => {
        const fullOrg = c.title ? `${c.org} ${c.title}`.trim() : c.org;
        const card = document.createElement('div');
        card.className = 'contact-card';
        card.innerHTML = `
            <div class="contact-info" onclick="openFormModal('${c.id}')" style="flex:1; cursor:pointer;">
                <div class="org">${fullOrg || '소속 없음'}</div>
                <div class="name">${c.name}</div>
                <div class="phone" style="margin-top: 6px;">
                    ${c.phone ? `<a href="tel:${c.phone}" onclick="event.stopPropagation()" style="text-decoration:none; color:#0ca678; font-weight:700; font-size:15px; margin-right:12px; display:inline-block; padding:2px 0;"><span class="material-icons-rounded" style="font-size:14px; vertical-align:middle;">smartphone</span> ${c.phone}</a>` : ''}
                    ${c.tel ? `<a href="tel:${c.tel}" onclick="event.stopPropagation()" style="text-decoration:none; color:#868e96; font-weight:500; font-size:14px; display:inline-block; padding:2px 0;"><span class="material-icons-rounded" style="font-size:14px; vertical-align:middle;">call</span> ${c.tel}</a>` : ''}
                </div>
            </div>
            <div class="contact-actions">
                <button class="action-text-btn save-btn" onclick="exportVCard('${c.id}')" title="핸드폰 연락처로 저장">폰저장</button>
                <button class="action-text-btn delete-btn" onclick="deleteContact('${c.id}')">삭제</button>
            </div>
        `;
        listEl.appendChild(card);
    });
}

// 핸드폰 연락처로 저장 (vCard 생성)
function exportVCard(id) {
    const contact = contacts.find(c => c.id === id);
    if (!contact) return;

    // vCard 3.0 포맷 생성
    let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
    vcard += `FN:${contact.name}\n`;
    vcard += `N:${contact.name.substring(0,1)};${contact.name.substring(1)};;;\n`;
    
    if (contact.org) vcard += `ORG:${contact.org}\n`;
    if (contact.title) vcard += `TITLE:${contact.title}\n`;
    if (contact.phone) vcard += `TEL;TYPE=CELL:${contact.phone.replace(/-/g, '')}\n`;
    if (contact.tel) vcard += `TEL;TYPE=WORK:${contact.tel.replace(/-/g, '')}\n`;
    if (contact.email) vcard += `EMAIL:${contact.email}\n`;
    if (contact.address) vcard += `ADR;TYPE=WORK:;;${contact.address};;;;\n`;
    if (contact.memo) vcard += `NOTE:${contact.memo}\n`;
    
    vcard += 'END:VCARD';

    // .vcf 파일 다운로드 (핸드폰이 자동으로 연락처 앱으로 열어줌)
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contact.name}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function filterContacts() {
    const text = document.getElementById('searchInput').value;
    renderContacts(text);
}

// 엑셀 내보내기 (SheetJS 사용)
function exportToExcel() {
    if (contacts.length === 0) {
        alert("저장된 연락처가 없습니다.");
        return;
    }
    
    // 데이터를 엑셀 포맷에 맞게 변환
    const dataForExcel = contacts.map((c, index) => ({
        '연번': index + 1,
        '소속': c.org || '',
        '직위': c.title || '',
        '성명': c.name || '',
        '휴대폰번호': c.phone || '',
        '일반전화': c.tel || '',
        '이메일': c.email || '',
        '주소': c.address || '',
        '비고(메모)': c.memo || ''
    }));

    // 워크북 생성
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataForExcel);

    // 컬럼 넓이 조절
    ws['!cols'] = [
        { wch: 5 },  // 연번
        { wch: 20 }, // 소속
        { wch: 10 }, // 직위
        { wch: 15 }, // 성명
        { wch: 18 }, // 휴대폰번호
        { wch: 18 }, // 일반전화
        { wch: 25 }, // 이메일
        { wch: 40 }, // 주소
        { wch: 30 }  // 비고(메모)
    ];

    XLSX.utils.book_append_sheet(wb, ws, "연락처 목록");

    // 오늘 날짜로 파일명 생성
    const today = new Date();
    const dateStr = today.getFullYear().toString() + 
                    (today.getMonth() + 1).toString().padStart(2, '0') + 
                    today.getDate().toString().padStart(2, '0');
    
    XLSX.writeFile(wb, `연락처목록_${dateStr}.xlsx`);
}
