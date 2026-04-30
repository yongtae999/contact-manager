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

// 명함 이미지 업로드 및 OCR 처리
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 로딩 화면 표시
    document.getElementById('loadingOverlay').style.display = 'flex';

    try {
        // Tesseract.js를 사용하여 이미지에서 텍스트 추출 (한국어 + 영어)
        const result = await Tesseract.recognize(file, 'kor+eng', {
            logger: m => console.log(m) // 진행상황 로그
        });

        const text = result.data.text;
        console.log("추출된 텍스트:\n", text);
        
        parseBusinessCard(text);
        
    } catch (error) {
        console.error(error);
        alert('명함 인식 중 오류가 발생했습니다. 직접 입력해주세요.');
        openFormModal(); // 실패시 직접 입력창 띄움
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
        event.target.value = ''; // 입력 초기화
    }
}

// OCR 텍스트 파싱 로직 (정규식 기반)
function parseBusinessCard(text) {
    // 흔한 OCR 한글 인식 오류 보정
    text = text.replace(/0l0|O1O|o1o|oIO/g, '010')
               .replace(/협희|합회|헙회|협하/g, '협회')
               .replace(/지투장|지무장|지부징/g, '지부장')
               .replace(/환걍|환경청|환겸/g, '환경')
               .replace(/대리|데리/g, '대리')
               .replace(/과징|과장/g, '과장')
               .replace(/부징|부장/g, '부장');

    let name = "";
    let phone = "";
    let tel = "";
    let email = "";
    let org = "";
    let title = "";
    let address = "";

    // 줄바꿈으로 분리
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // 1. 전화번호 및 이메일 정규식
    const phoneRegex = /(010|011|016|017|018|019)[\-\s]*\d{3,4}[\-\s]*\d{4}/;
    const telRegex = /(02|0[3-6][1-5]|070|050[2-7]|0[8-9]0)[\-\s]*\d{3,4}[\-\s]*\d{4}/;
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // 휴대폰 추출
        if (!phone) {
            const phoneMatch = line.match(phoneRegex);
            if (phoneMatch) {
                phone = phoneMatch[0].replace(/[^0-9]/g, ''); // 숫자만 남기기
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

        // 이메일 추출
        if (!email) {
            const emailMatch = line.match(emailRegex);
            if (emailMatch) {
                email = emailMatch[0];
                continue;
            }
        }
        
        // 주소 추출 (시/도/군/구/동/로/길 패턴)
        if (!address) {
            if (line.includes('특별시') || line.includes('광역시') || line.match(/[가-힣]+[도시군구]\s+[가-힣]+[동읍면리로길]/)) {
                let possibleAddress = line.replace(/^(주소|Add|Address|A)\s*[:]?\s*/i, '').trim();
                if (possibleAddress.length > 5) {
                    address = possibleAddress;
                }
            }
        }

        // 소속 유추
        if (!org && (line.includes('협회') || line.includes('지부') || line.includes('환경청') || line.includes('센터'))) {
            org = line;
        }

        // 직급 유추
        const titleKeywords = ['지부장', '국장', '본부장', '부장', '과장', '대리', '주임', '대표', '소장', '팀장', '이사', '연구원'];
        for (let tk of titleKeywords) {
            if (line.includes(tk) && !title) {
                title = tk;
                // 만약 직급과 이름이 한 줄에 붙어있는 경우 (예: 홍길동 지부장)
                let possibleName = line.replace(tk, '').replace(/[^가-힣]/g, '').trim();
                if (possibleName.length >= 2 && possibleName.length <= 4 && !possibleName.includes('지부') && !possibleName.includes('협회')) {
                    name = possibleName;
                }
                break;
            }
        }
    }

    // 이름을 못 찾았을 때 더 똑똑하게 추론
    if (!name && lines.length > 0) {
        const skipWords = ['이메일', '팩스', '전화', '모바일', '주소', '직통', '본부', '지부', '지회', '협회', '환경', '대한', '민국', '센터', '사무', '번호', '명함', '기관', '야생', '관리', '텔레'];
        const koreanSurnames = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','전','홍','유','류','고','문','양','손','배','백','허','남','심','노','하','곽','성','차','주','우','구','나','민','진','지','엄','채','원','천','방','공','현','함','변','염','여','추','도','소','석','선','설','마','길','연','위','표','명','기','반','왕','금','옥','육','인','맹','제','모','탁','국','어','은','편','용','남궁','황보','제갈','사공','선우','독고'];

        // 1. 성씨 매칭 시도
        for(let line of lines) {
            let cleanLine = line.replace(/[^가-힣]/g, '');
            if (skipWords.some(word => line.includes(word))) continue;

            if(cleanLine.length >= 2 && cleanLine.length <= 4) {
                let firstChar = cleanLine.charAt(0);
                let firstTwoChars = cleanLine.substring(0, 2);
                if (koreanSurnames.includes(firstChar) || koreanSurnames.includes(firstTwoChars)) {
                    name = cleanLine;
                    break;
                }
            }
        }

        // 2. 성씨 매칭도 실패했다면, 제외 단어가 없는 정확히 3글자인 단어
        if (!name) {
            for(let line of lines) {
                let cleanLine = line.replace(/[^가-힣]/g, '');
                if (skipWords.some(word => line.includes(word))) continue;

                if(cleanLine.length === 3) {
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

    if (!name || !phone) {
        alert("성명과 휴대폰 번호는 필수 입력입니다.");
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
                <button class="icon-btn" onclick="deleteContact('${c.id}')">
                    <span class="material-icons-rounded" style="font-size: 20px;">delete</span>
                </button>
                <a href="tel:${c.phone}" class="call-btn">
                    <span class="material-icons-rounded" style="font-size: 20px;">call</span>
                </a>
            </div>
        `;
        listEl.appendChild(card);
    });
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
