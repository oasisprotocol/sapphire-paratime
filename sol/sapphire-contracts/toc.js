// Populate the sidebar
//
// This is a script, and not included directly in the page, to control the total size of the book.
// The TOC contains an entry for each page, so if each page includes a copy of the TOC,
// the total size of the page becomes O(n**2).
class MDBookSidebarScrollbox extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.innerHTML = '<ol class="chapter"><li class="chapter-item "><a href="index.html">Home</a></li><li class="chapter-item affix "><li class="part-title">contracts</li><li class="chapter-item "><a href="contracts/auth/index.html">❱ auth</a><a class="toggle"><div>❱</div></a></li><li><ol class="section"><li class="chapter-item "><a href="contracts/auth/A13e.sol/abstract.A13e.html">A13e</a></li><li class="chapter-item "><a href="contracts/auth/SiweAuth.sol/struct.AuthToken.html">AuthToken</a></li><li class="chapter-item "><a href="contracts/auth/SiweAuth.sol/contract.SiweAuth.html">SiweAuth</a></li></ol></li><li class="chapter-item "><a href="contracts/opl/index.html">❱ opl</a><a class="toggle"><div>❱</div></a></li><li><ol class="section"><li class="chapter-item "><a href="contracts/opl/Enclave.sol/contract.Enclave.html">Enclave</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/error.AutoConfigUnavailable.html">AutoConfigUnavailable</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/error.MissingRemoteAddr.html">MissingRemoteAddr</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/error.MissingRemoteChainId.html">MissingRemoteChainId</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/error.SelfCallDisallowed.html">SelfCallDisallowed</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/error.UnknownEndpoint.html">UnknownEndpoint</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/enum.Result.html">Result</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/interface.ICelerMessageBus.html">ICelerMessageBus</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/contract.BaseEndpoint.html">BaseEndpoint</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/contract.Endpoint.html">Endpoint</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/function._getBus.html">_getBus</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/function._getChainConfig.html">_getChainConfig</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/function._chainName2ChainId.html">_chainName2ChainId</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/function._getRemoteChainId.html">_getRemoteChainId</a></li><li class="chapter-item "><a href="contracts/opl/Endpoint.sol/function.autoswitch.html">autoswitch</a></li><li class="chapter-item "><a href="contracts/opl/Host.sol/contract.Host.html">Host</a></li></ol></li><li class="chapter-item "><a href="contracts/CBOR.sol/error.CBOR_InvalidKey.html">CBOR_InvalidKey</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/error.CBOR_InvalidMap.html">CBOR_InvalidMap</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/error.CBOR_InvalidLength.html">CBOR_InvalidLength</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/error.CBOR_InvalidUintPrefix.html">CBOR_InvalidUintPrefix</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/error.CBOR_InvalidUintSize.html">CBOR_InvalidUintSize</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/error.CBOR_Error_ValueOutOfRange.html">CBOR_Error_ValueOutOfRange</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/error.CBOR_Error_BufferOverrun.html">CBOR_Error_BufferOverrun</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/error.CBOR_Error_BytesTooLong.html">CBOR_Error_BytesTooLong</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/function.parseUint128.html">parseUint128</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/function.encodeUint.html">encodeUint</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/function.parseUint.html">parseUint</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/function.encodeBytes.html">encodeBytes</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/function.parseKey.html">parseKey</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/function.parseUint64.html">parseUint64</a></li><li class="chapter-item "><a href="contracts/CBOR.sol/function.parseMapStart.html">parseMapStart</a></li><li class="chapter-item "><a href="contracts/CalldataEncryption.sol/function._deriveKey.html">_deriveKey</a></li><li class="chapter-item "><a href="contracts/CalldataEncryption.sol/function._encryptInner.html">_encryptInner</a></li><li class="chapter-item "><a href="contracts/CalldataEncryption.sol/function.encryptCallData.html">encryptCallData</a></li><li class="chapter-item "><a href="contracts/ConsensusUtils.sol/type.StakingAddress.html">StakingAddress</a></li><li class="chapter-item "><a href="contracts/ConsensusUtils.sol/type.StakingSecretKey.html">StakingSecretKey</a></li><li class="chapter-item "><a href="contracts/ConsensusUtils.sol/library.ConsensusUtils.html">ConsensusUtils</a></li><li class="chapter-item "><a href="contracts/DateTime.sol/library.DateTime.html">DateTime</a></li><li class="chapter-item "><a href="contracts/EIP1559Signer.sol/library.EIP1559Signer.html">EIP1559Signer</a></li><li class="chapter-item "><a href="contracts/EIP155Signer.sol/library.EIP155Signer.html">EIP155Signer</a></li><li class="chapter-item "><a href="contracts/EIP2930Signer.sol/library.EIP2930Signer.html">EIP2930Signer</a></li><li class="chapter-item "><a href="contracts/EIPTypes.sol/library.EIPTypes.html">EIPTypes</a></li><li class="chapter-item "><a href="contracts/EthereumUtils.sol/struct.SignatureRSV.html">SignatureRSV</a></li><li class="chapter-item "><a href="contracts/EthereumUtils.sol/library.EthereumUtils.html">EthereumUtils</a></li><li class="chapter-item "><a href="contracts/RLPWriter.sol/library.RLPWriter.html">RLPWriter</a></li><li class="chapter-item "><a href="contracts/Sapphire.sol/library.Sapphire.html">Sapphire</a></li><li class="chapter-item "><a href="contracts/Sapphire.sol/function.sha384.html">sha384</a></li><li class="chapter-item "><a href="contracts/Sapphire.sol/function.sha512.html">sha512</a></li><li class="chapter-item "><a href="contracts/Sapphire.sol/function.sha512_256.html">sha512_256</a></li><li class="chapter-item "><a href="contracts/SiweParser.sol/struct.ParsedSiweMessage.html">ParsedSiweMessage</a></li><li class="chapter-item "><a href="contracts/SiweParser.sol/library.SiweParser.html">SiweParser</a></li><li class="chapter-item "><a href="contracts/Subcall.sol/enum.SubcallReceiptKind.html">SubcallReceiptKind</a></li><li class="chapter-item "><a href="contracts/Subcall.sol/library.Subcall.html">Subcall</a></li><li class="chapter-item "><a href="contracts/WrappedROSE.sol/contract.WrappedROSE.html">WrappedROSE</a></li><li class="chapter-item "><a href="contracts/hmac_sha512_256.sol/error.hmac_sha512_256_memcpy.html">hmac_sha512_256_memcpy</a></li><li class="chapter-item "><a href="contracts/hmac_sha512_256.sol/function.hmac_sha512_256.html">hmac_sha512_256</a></li><li class="chapter-item "><a href="contracts/hmac_sha512_256.sol/constants.hmac_sha512_256.html">hmac_sha512_256 constants</a></li></ol>';
        // Set the current, active page, and reveal it if it's hidden
        let current_page = document.location.href.toString().split("#")[0].split("?")[0];
        if (current_page.endsWith("/")) {
            current_page += "index.html";
        }
        var links = Array.prototype.slice.call(this.querySelectorAll("a"));
        var l = links.length;
        for (var i = 0; i < l; ++i) {
            var link = links[i];
            var href = link.getAttribute("href");
            if (href && !href.startsWith("#") && !/^(?:[a-z+]+:)?\/\//.test(href)) {
                link.href = path_to_root + href;
            }
            // The "index" page is supposed to alias the first chapter in the book.
            if (link.href === current_page || (i === 0 && path_to_root === "" && current_page.endsWith("/index.html"))) {
                link.classList.add("active");
                var parent = link.parentElement;
                if (parent && parent.classList.contains("chapter-item")) {
                    parent.classList.add("expanded");
                }
                while (parent) {
                    if (parent.tagName === "LI" && parent.previousElementSibling) {
                        if (parent.previousElementSibling.classList.contains("chapter-item")) {
                            parent.previousElementSibling.classList.add("expanded");
                        }
                    }
                    parent = parent.parentElement;
                }
            }
        }
        // Track and set sidebar scroll position
        this.addEventListener('click', function(e) {
            if (e.target.tagName === 'A') {
                sessionStorage.setItem('sidebar-scroll', this.scrollTop);
            }
        }, { passive: true });
        var sidebarScrollTop = sessionStorage.getItem('sidebar-scroll');
        sessionStorage.removeItem('sidebar-scroll');
        if (sidebarScrollTop) {
            // preserve sidebar scroll position when navigating via links within sidebar
            this.scrollTop = sidebarScrollTop;
        } else {
            // scroll sidebar to current active section when navigating via "next/previous chapter" buttons
            var activeSection = document.querySelector('#sidebar .active');
            if (activeSection) {
                activeSection.scrollIntoView({ block: 'center' });
            }
        }
        // Toggle buttons
        var sidebarAnchorToggles = document.querySelectorAll('#sidebar a.toggle');
        function toggleSection(ev) {
            ev.currentTarget.parentElement.classList.toggle('expanded');
        }
        Array.from(sidebarAnchorToggles).forEach(function (el) {
            el.addEventListener('click', toggleSection);
        });
    }
}
window.customElements.define("mdbook-sidebar-scrollbox", MDBookSidebarScrollbox);
