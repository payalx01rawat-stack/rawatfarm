export const isProduction = (nodeEnv: string | undefined): boolean => nodeEnv === 'production';

export const LANGUAGE_STORAGE_KEY = 'farmmitra_language';
export const languages = ['en', 'hi', 'hinglish'] as const;
export type Language = (typeof languages)[number];

type TranslationKey =
  | 'dashboard' | 'customers' | 'orders' | 'paymentHistory' | 'outstandingBalance'
  | 'collectPayment' | 'cashHandover' | 'applyFilter' | 'downloadStatement'
  | 'products' | 'categories' | 'units' | 'payments' | 'delivery' | 'settings'
  | 'account' | 'login' | 'logout' | 'register' | 'signIn' | 'createAccount'
  | 'emailOrMobile' | 'password' | 'search' | 'filter' | 'reset' | 'loading'
  | 'tryAgain' | 'save' | 'cancel' | 'confirm' | 'date' | 'time' | 'amount'
  | 'method' | 'status' | 'orderNumber' | 'product' | 'quantity' | 'unitPrice'
  | 'total' | 'paymentStatus' | 'orderStatus' | 'deliveryStatus' | 'totalOrders'
  | 'totalOrderValue' | 'totalPaid' | 'totalPending' | 'openingBalance'
  | 'totalCharges' | 'totalPayments' | 'adjustments' | 'closingBalance' | 'debit'
  | 'credit' | 'transactionId' | 'description' | 'reference' | 'collectedBy'
  | 'transactionStatus' | 'noRecords' | 'day' | 'week' | 'month' | 'customDateRange'
  | 'from' | 'to' | 'previous' | 'next' | 'print' | 'refresh' | 'english' | 'hindi'
  | 'hinglish' | 'cash' | 'upi' | 'customerKhata' | 'financialSummary'
  | 'orderHistory' | 'customerSummary' | 'totalCollected' | 'openingBalanceNote'
  | 'pageOf' | 'allTime' | 'paymentRecorded' | 'statementPeriod' | 'name' | 'mobile'
  | 'address' | 'paymentMethod' | 'order' | 'outstanding' | 'viewKhata' | 'email';
type ExtendedTranslationKey =
  | 'customerDetails' | 'backToCustomers' | 'contactInfoAndAddresses' | 'paymentDate'
  | 'recordedPayments' | 'noCustomerPayments' | 'rawatFarmOrders' | 'noCustomerOrders'
  | 'orderTotal' | 'paymentCollected' | 'notAssigned' | 'paymentCollections'
  | 'outstandingPayments' | 'vendorDashboard' | 'vendorOrders' | 'deliveryDetails'
  | 'productDetails' | 'myOrders' | 'orderDetails' | 'inventory' | 'collections'
  | 'khata' | 'customerShop' | 'signInToContinue' | 'savedAddressesOrders' | 'newCustomer'
  | 'backToShop' | 'createYourAccount' | 'shopSignup' | 'fullName' | 'mobileNumber'
  | 'optionalEmail' | 'confirmPassword' | 'existingCustomer' | 'welcomeBack' | 'adminOperations'
  | 'signInToManage' | 'email' | 'enterPassword' | 'signingIn' | 'readyForRoute'
  | 'deliveryAccountSignIn' | 'thisDeliveryAccount' | 'unableToSignIn' | 'todayRoute'
  | 'signingInEllipsis' | 'customerHome';
type DeliveryTranslationKey =
  | 'backToOrders' | 'deliveryDetail' | 'customerAndAddress' | 'deliveryAddress' | 'items'
  | 'paymentSummary' | 'collected' | 'recordCollection' | 'transactionReferenceId' | 'recording'
  | 'accept' | 'accepting' | 'startDelivery' | 'startingDelivery' | 'completeDelivery'
  | 'completingDelivery' | 'loadingYourRoute' | 'routeUnavailable' | 'today' | 'yourRouteAtAGlance'
  | 'deliveries' | 'completed' | 'pending' | 'recentActivity' | 'viewAll' | 'noDeliveriesAssigned'
  | 'assignedOrders' | 'yourDeliveries' | 'outForDelivery' | 'paymentPending' | 'noDeliveriesMatch'
  | 'balancesToCollect' | 'nothingOutstanding' | 'paymentHistoryHeading' | 'collectionsHeading'
  | 'noPaymentCollections' | 'profile' | 'roles' | 'contactNotProvided' | 'history'
  | 'paymentCollection' | 'ordersAwaitingPayment' | 'assignedTo' | 'noDeliveryAssignment' | 'noCollectibleOrders' | 'collectionUnavailable';

type ShopLandingTranslationKey =
  | 'freshFromOurFarm' | 'searchProductsPlaceholder' | 'freshFoodTagline' | 'shopFreshEssentials' | 'freshDaily'
  | 'shopTheMarket' | 'popularToday' | 'productCount' | 'category' | 'allCategories' | 'sort' | 'nameSort'
  | 'lowPriceFirst' | 'highPriceFirst' | 'clearFilters' | 'noProductsMatch' | 'tryAnotherSearch'
  | 'soldBy' | 'qualityPackedFresh' | 'onlyFewLeft' | 'available' | 'inStock' | 'unavailable' | 'add'
  | 'addProductToCart' | 'productOutOfStock' | 'cart' | 'itemsCount' | 'cartWaiting' | 'browseProducts'
  | 'checkout' | 'productAdded' | 'decrease' | 'increase' | 'remove';

type AdminPaymentsTranslationKey =
  | 'paymentHistoryDescription' | 'staffCashHandovers' | 'handoverDescription' | 'deliveryPartner'
  | 'cashCollected' | 'cashHandedOver' | 'availableCash' | 'selectPartner' | 'handoverAmount'
  | 'notes' | 'recentHandovers' | 'handoverNumber' | 'receivedBy' | 'noActivePartners' | 'noHandovers'
  | 'amountMustFitCash' | 'recordHandover' | 'recordingHandover' | 'handoverSuccess'
  | 'searchPaymentRecords' | 'all' | 'collected' | 'completed' | 'cashCollectedStatus'
  | 'upiCollectedStatus' | 'paymentId' | 'business' | 'upiReference' | 'received' | 'loadingPayments'
  | 'noPaymentsMatch';

type DeliveryDashboardTranslationKey =
  | 'goodMorning' | 'upiNotConfigured' | 'enterAmountWithinOutstanding' | 'upiReferenceRequired'
  | 'deliveryCompleted' | 'recorded';

type AdminCustomerTranslationKey = 'customerHistoryDescription' | 'pricePerItem' | 'lineTotal';

type AnyTranslationKey = TranslationKey | ExtendedTranslationKey | DeliveryTranslationKey | ShopLandingTranslationKey | AdminPaymentsTranslationKey | DeliveryDashboardTranslationKey | AdminCustomerTranslationKey;
const translations: Record<Language, Record<AnyTranslationKey, string>> = {
  en: {
    dashboard: 'Dashboard', customers: 'Customers', orders: 'Orders', paymentHistory: 'Payment History', outstandingBalance: 'Outstanding Balance',
    collectPayment: 'Collect Payment', cashHandover: 'Cash Handover', applyFilter: 'Apply Filter', downloadStatement: 'Download Statement',
    products: 'Products', categories: 'Categories', units: 'Units', payments: 'Payments', delivery: 'Delivery', settings: 'Settings',
    account: 'Account', login: 'Login', logout: 'Log out', register: 'Register', signIn: 'Sign in', createAccount: 'Create account',
    emailOrMobile: 'Email or mobile', password: 'Password', search: 'Search', filter: 'Filter', reset: 'Reset', loading: 'Loading...',
    tryAgain: 'Try again', save: 'Save', cancel: 'Cancel', confirm: 'Confirm', date: 'Date', time: 'Time', amount: 'Amount',
    method: 'Method', status: 'Status', orderNumber: 'Order number', product: 'Product', quantity: 'Quantity', unitPrice: 'Unit price',
    total: 'Total', paymentStatus: 'Payment status', orderStatus: 'Order status', deliveryStatus: 'Delivery status',
    totalOrders: 'Total orders', totalOrderValue: 'Total order value', totalPaid: 'Total paid', totalPending: 'Total pending',
    openingBalance: 'Opening balance', totalCharges: 'Total charges', totalPayments: 'Total payments', adjustments: 'Adjustments',
    closingBalance: 'Closing balance', debit: 'Debit', credit: 'Credit', transactionId: 'Transaction ID', description: 'Description',
    reference: 'Reference', collectedBy: 'Collected by', transactionStatus: 'Transaction status', noRecords: 'No records found.',
    day: 'Day', week: 'Week', month: 'Month', customDateRange: 'Custom date range', from: 'From', to: 'To',
    previous: 'Previous', next: 'Next', print: 'Print', refresh: 'Refresh', english: 'English', hindi: 'हिंदी', hinglish: 'Hinglish',
    cash: 'Cash', upi: 'UPI', customerKhata: 'Customer Khata', financialSummary: 'Financial summary',
    orderHistory: 'Order history', customerSummary: 'Customer summary', totalCollected: 'Total collected',
    openingBalanceNote: 'Opening balance is calculated from transactions before this period.', pageOf: 'Page {page} of {pages}',
    allTime: 'All time', paymentRecorded: 'Payment recorded', statementPeriod: 'Statement period', name: 'Name', mobile: 'Mobile',
    address: 'Address', paymentMethod: 'Payment method', order: 'Order', outstanding: 'Outstanding', viewKhata: 'View Khata', email: 'Email',
    customerDetails: 'Customer details', backToCustomers: 'Back to customers', contactInfoAndAddresses: 'Contact information and delivery addresses',
    paymentDate: 'Payment date', recordedPayments: '{count} recorded payment(s)', noCustomerPayments: 'No payment records for this customer.',
    rawatFarmOrders: '{count} Rawat Farm order(s)', noCustomerOrders: 'No orders for this customer.', orderTotal: 'Order total',
    paymentCollected: 'Payment collected', notAssigned: 'Not assigned', paymentCollections: 'Payment collections',
    outstandingPayments: 'Outstanding payments', vendorDashboard: 'Vendor dashboard', vendorOrders: 'Vendor orders',
    deliveryDetails: 'Delivery details', productDetails: 'Product details', myOrders: 'My orders', orderDetails: 'Order details',
    inventory: 'Inventory', collections: 'Collections', khata: 'Khata',
    customerShop: 'Customer shop', signInToContinue: 'Sign in to continue',
    savedAddressesOrders: 'Access your saved addresses and orders.', newCustomer: 'New customer?',
    backToShop: 'Back to Rawat Farm shop', createYourAccount: 'Create your account',
    shopSignup: 'Sign up to shop from Rawat Farm.', fullName: 'Full name', mobileNumber: 'Mobile number',
    optionalEmail: 'Email (optional)', confirmPassword: 'Confirm password', existingCustomer: 'Already have an account?',
    welcomeBack: 'Welcome back', adminOperations: 'Admin Operations', signInToManage: 'Sign in to manage Rawat Farm operations.',
    enterPassword: 'Enter your password', signingIn: 'Signing in...', readyForRoute: "Ready for today's route?",
    deliveryAccountSignIn: 'Sign in with your Rawat Farm delivery account.', thisDeliveryAccount: 'This account is not a delivery partner account',
    unableToSignIn: 'Unable to sign in', todayRoute: 'Your route at a glance', signingInEllipsis: 'Signing in...',
    customerHome: 'Customer shop',
    backToOrders: 'Back to orders', deliveryDetail: 'Delivery detail', customerAndAddress: 'Customer & address',
    deliveryAddress: 'Delivery address', items: 'Items', paymentSummary: 'Payment summary', collected: 'Collected',
    recordCollection: 'Record collection', transactionReferenceId: 'Transaction/reference ID', recording: 'Recording...',
    accept: 'Accept', accepting: 'Accepting...', startDelivery: 'Start delivery', startingDelivery: 'Starting...',
    completeDelivery: 'Complete delivery', completingDelivery: 'Completing...', loadingYourRoute: 'Loading your route',
    routeUnavailable: 'Route unavailable', today: 'Today', yourRouteAtAGlance: 'Your route at a glance',
    deliveries: 'Deliveries', completed: 'Completed', pending: 'Pending', recentActivity: 'Recent activity',
    viewAll: 'View all', noDeliveriesAssigned: 'No deliveries assigned yet.', assignedOrders: 'Assigned orders',
    yourDeliveries: 'Your deliveries', outForDelivery: 'Out for delivery', paymentPending: 'Payment pending',
    noDeliveriesMatch: 'No deliveries match this filter.', balancesToCollect: 'Balances to collect',
    nothingOutstanding: 'Nothing outstanding on your assigned orders.', paymentHistoryHeading: 'Payment history',
    collectionsHeading: 'Collections', noPaymentCollections: 'No payment collections recorded.',
    paymentCollection: 'Payment collection', ordersAwaitingPayment: 'Orders awaiting payment', assignedTo: 'Assigned to',
    noDeliveryAssignment: 'No delivery partner assigned', noCollectibleOrders: 'No outstanding Rawat Farm orders to collect.',
    collectionUnavailable: 'Payment collection unavailable', profile: 'Profile',
    roles: 'Roles', contactNotProvided: 'Contact not provided', history: 'History',
    freshFromOurFarm: 'Fresh from our farm', searchProductsPlaceholder: 'Search chicken, mutton, eggs...',
    freshFoodTagline: 'Good food, raised with care.', shopFreshEssentials: 'Shop fresh meat, poultry, fish and farm essentials from Rawat Farm.',
    freshDaily: 'FRESH DAILY', shopTheMarket: 'SHOP THE MARKET', popularToday: 'Popular today', productCount: '{count} products',
    category: 'Category', allCategories: 'All categories', sort: 'Sort', nameSort: 'Name', lowPriceFirst: 'Price: low to high',
    highPriceFirst: 'Price: high to low', clearFilters: 'Clear filters', noProductsMatch: 'No products match those filters.',
    tryAnotherSearch: 'Try another search or clear the filters to browse the full market.', soldBy: 'Sold by',
    qualityPackedFresh: 'Quality checked and packed fresh.', onlyFewLeft: 'Only a few left', available: 'Available',
    inStock: 'In stock', unavailable: 'Unavailable', add: 'Add', addProductToCart: 'Add {product} to cart',
    productOutOfStock: '{product} is out of stock', cart: 'Cart', itemsCount: '{count} items',
    cartWaiting: 'Your cart is waiting for something fresh.', browseProducts: 'Browse products', checkout: 'Checkout',
    productAdded: '{product} added to cart.',
    decrease: 'Decrease', increase: 'Increase', remove: 'Remove',
    paymentHistoryDescription: 'Issued and collected payments across FarmMitra orders.',
    staffCashHandovers: 'Staff cash handovers', handoverDescription: 'Admin-confirmed cash transfers are recorded separately from customer payments.',
    deliveryPartner: 'Delivery partner', cashCollected: 'Cash collected', cashHandedOver: 'Cash handed over', availableCash: 'Available cash',
    selectPartner: 'Select a partner', handoverAmount: 'Handover amount', notes: 'Notes', recentHandovers: 'Recent handovers',
    handoverNumber: 'Handover number', receivedBy: 'Received by', noActivePartners: 'No active Rawat Farm delivery partners.',
    noHandovers: 'No cash handovers recorded.', amountMustFitCash: "Enter a positive amount no greater than this partner's available collected cash.",
    recordHandover: 'Record cash handover', recordingHandover: 'Recording...', handoverSuccess: 'Cash handover recorded. Customer balances are unchanged.',
    searchPaymentRecords: 'Order number, payment ID, UPI ref', all: 'All',
    cashCollectedStatus: 'Cash collected', upiCollectedStatus: 'UPI collected', paymentId: 'Payment ID', business: 'Business',
    upiReference: 'UPI reference', received: 'Received', loadingPayments: 'Loading payment records...',
    noPaymentsMatch: 'No payment records match your filters.',
    goodMorning: 'Good morning, {name}', upiNotConfigured: 'Rawat Farm UPI is not configured. Use Cash until the confirmed UPI ID is saved in Admin Settings.',
    enterAmountWithinOutstanding: 'Enter an amount greater than zero and no more than the outstanding balance.',
    upiReferenceRequired: 'A UPI reference ID is required.', deliveryCompleted: 'Delivery completed.', recorded: 'Recorded',
    customerHistoryDescription: 'Rawat Farm customer, payment, and order history', pricePerItem: 'Price per item', lineTotal: 'Line total',
  },
  hi: {
    dashboard: 'डैशबोर्ड', customers: 'ग्राहक', orders: 'ऑर्डर', paymentHistory: 'भुगतान का इतिहास', outstandingBalance: 'बकाया राशि',
    collectPayment: 'भुगतान प्राप्त करें', cashHandover: 'नकद जमा करें', applyFilter: 'फ़िल्टर लागू करें', downloadStatement: 'विवरण डाउनलोड करें',
    products: 'उत्पाद', categories: 'श्रेणियाँ', units: 'इकाइयाँ', payments: 'भुगतान', delivery: 'डिलीवरी', settings: 'सेटिंग्स',
    account: 'खाता', login: 'लॉग इन', logout: 'लॉग आउट', register: 'पंजीकरण', signIn: 'साइन इन', createAccount: 'खाता बनाएँ',
    emailOrMobile: 'ईमेल या मोबाइल', password: 'पासवर्ड', search: 'खोजें', filter: 'फ़िल्टर', reset: 'रीसेट', loading: 'लोड हो रहा है...',
    tryAgain: 'फिर कोशिश करें', save: 'सहेजें', cancel: 'रद्द करें', confirm: 'पुष्टि करें', date: 'तारीख', time: 'समय', amount: 'राशि',
    method: 'तरीका', status: 'स्थिति', orderNumber: 'ऑर्डर नंबर', product: 'उत्पाद', quantity: 'मात्रा', unitPrice: 'प्रति इकाई कीमत',
    total: 'कुल', paymentStatus: 'भुगतान की स्थिति', orderStatus: 'ऑर्डर की स्थिति', deliveryStatus: 'डिलीवरी की स्थिति',
    totalOrders: 'कुल ऑर्डर', totalOrderValue: 'ऑर्डर का कुल मूल्य', totalPaid: 'कुल भुगतान', totalPending: 'कुल बकाया',
    openingBalance: 'शुरुआती बकाया', totalCharges: 'कुल शुल्क', totalPayments: 'कुल भुगतान', adjustments: 'समायोजन',
    closingBalance: 'अंतिम बकाया', debit: 'डेबिट', credit: 'क्रेडिट', transactionId: 'लेन-देन आईडी', description: 'विवरण',
    reference: 'संदर्भ', collectedBy: 'राशि प्राप्तकर्ता', transactionStatus: 'लेन-देन की स्थिति', noRecords: 'कोई रिकॉर्ड नहीं मिला।',
    day: 'दिन', week: 'सप्ताह', month: 'महीना', customDateRange: 'तारीख की सीमा', from: 'से', to: 'तक',
    previous: 'पिछला', next: 'अगला', print: 'प्रिंट करें', refresh: 'रीफ़्रेश करें', english: 'English', hindi: 'हिंदी', hinglish: 'Hinglish',
    cash: 'नकद', upi: 'UPI', customerKhata: 'ग्राहक खाता', financialSummary: 'वित्तीय सारांश',
    orderHistory: 'ऑर्डर का इतिहास', customerSummary: 'ग्राहक सारांश', totalCollected: 'कुल प्राप्त राशि',
    openingBalanceNote: 'शुरुआती बकाया इस अवधि से पहले के लेन-देन से निकाला गया है।', pageOf: 'पृष्ठ {page} / {pages}',
    allTime: 'पूरी अवधि', paymentRecorded: 'भुगतान दर्ज हुआ', statementPeriod: 'विवरण अवधि', name: 'नाम', mobile: 'मोबाइल',
    address: 'पता', paymentMethod: 'भुगतान का तरीका', order: 'ऑर्डर', outstanding: 'बकाया', viewKhata: 'खाता देखें', email: 'ईमेल',
    customerDetails: 'ग्राहक का विवरण', backToCustomers: 'ग्राहकों पर वापस जाएँ', contactInfoAndAddresses: 'संपर्क जानकारी और डिलीवरी पते',
    paymentDate: 'भुगतान की तारीख', recordedPayments: '{count} भुगतान दर्ज', noCustomerPayments: 'इस ग्राहक के लिए भुगतान रिकॉर्ड नहीं है।',
    rawatFarmOrders: 'Rawat Farm के {count} ऑर्डर', noCustomerOrders: 'इस ग्राहक के लिए ऑर्डर नहीं हैं।', orderTotal: 'ऑर्डर का कुल',
    paymentCollected: 'प्राप्त भुगतान', notAssigned: 'असाइन नहीं हुआ', paymentCollections: 'भुगतान संग्रह',
    outstandingPayments: 'बकाया भुगतान', vendorDashboard: 'विक्रेता डैशबोर्ड', vendorOrders: 'विक्रेता ऑर्डर',
    deliveryDetails: 'डिलीवरी का विवरण', productDetails: 'उत्पाद का विवरण', myOrders: 'मेरे ऑर्डर', orderDetails: 'ऑर्डर का विवरण',
    inventory: 'इन्वेंटरी', collections: 'संग्रह', khata: 'खाता',
    customerShop: 'ग्राहक दुकान', signInToContinue: 'आगे बढ़ने के लिए साइन इन करें',
    savedAddressesOrders: 'अपने सहेजे हुए पते और ऑर्डर देखें।', newCustomer: 'नए ग्राहक हैं?',
    backToShop: 'Rawat Farm की दुकान पर वापस जाएँ', createYourAccount: 'अपना खाता बनाएँ',
    shopSignup: 'Rawat Farm से खरीदारी करने के लिए पंजीकरण करें।', fullName: 'पूरा नाम', mobileNumber: 'मोबाइल नंबर',
    optionalEmail: 'ईमेल (वैकल्पिक)', confirmPassword: 'पासवर्ड की पुष्टि करें', existingCustomer: 'पहले से खाता है?',
    welcomeBack: 'वापसी पर स्वागत है', adminOperations: 'एडमिन संचालन', signInToManage: 'Rawat Farm संचालन प्रबंधित करने के लिए साइन इन करें।',
    enterPassword: 'अपना पासवर्ड दर्ज करें', signingIn: 'साइन इन हो रहा है...', readyForRoute: 'आज के रूट के लिए तैयार हैं?',
    deliveryAccountSignIn: 'अपने Rawat Farm डिलीवरी खाते से साइन इन करें।', thisDeliveryAccount: 'यह डिलीवरी पार्टनर खाता नहीं है',
    unableToSignIn: 'साइन इन नहीं हो सका', todayRoute: 'आज का रूट एक नज़र में', signingInEllipsis: 'साइन इन हो रहा है...',
    customerHome: 'ग्राहक दुकान',
    backToOrders: 'ऑर्डर पर वापस जाएँ', deliveryDetail: 'डिलीवरी विवरण', customerAndAddress: 'ग्राहक और पता',
    deliveryAddress: 'डिलीवरी का पता', items: 'सामान', paymentSummary: 'भुगतान सारांश', collected: 'प्राप्त राशि',
    recordCollection: 'भुगतान दर्ज करें', transactionReferenceId: 'लेन-देन / संदर्भ आईडी', recording: 'दर्ज हो रहा है...',
    accept: 'स्वीकार करें', accepting: 'स्वीकार हो रहा है...', startDelivery: 'डिलीवरी शुरू करें', startingDelivery: 'शुरू हो रहा है...',
    completeDelivery: 'डिलीवरी पूरी करें', completingDelivery: 'पूरा हो रहा है...', loadingYourRoute: 'आपका रूट लोड हो रहा है',
    routeUnavailable: 'रूट उपलब्ध नहीं है', today: 'आज', yourRouteAtAGlance: 'आज का रूट एक नज़र में',
    deliveries: 'डिलीवरी', completed: 'पूरी हुई', pending: 'बाकी', recentActivity: 'हाल की गतिविधि',
    viewAll: 'सभी देखें', noDeliveriesAssigned: 'अभी कोई डिलीवरी असाइन नहीं है।', assignedOrders: 'असाइन किए गए ऑर्डर',
    yourDeliveries: 'आपकी डिलीवरी', outForDelivery: 'डिलीवरी के लिए निकला', paymentPending: 'भुगतान बाकी',
    noDeliveriesMatch: 'इस फ़िल्टर में कोई डिलीवरी नहीं है।', balancesToCollect: 'वसूली की बाकी राशि',
    nothingOutstanding: 'आपके असाइन किए गए ऑर्डर में कोई बकाया नहीं है।', paymentHistoryHeading: 'भुगतान इतिहास',
    collectionsHeading: 'भुगतान संग्रह', noPaymentCollections: 'कोई भुगतान संग्रह दर्ज नहीं है।',
    paymentCollection: 'भुगतान संग्रह', ordersAwaitingPayment: 'भुगतान की प्रतीक्षा वाले ऑर्डर', assignedTo: 'असाइन किया गया',
    noDeliveryAssignment: 'कोई डिलीवरी पार्टनर असाइन नहीं है', noCollectibleOrders: 'वसूली के लिए कोई बकाया Rawat Farm ऑर्डर नहीं है।',
    collectionUnavailable: 'भुगतान संग्रह उपलब्ध नहीं है', profile: 'प्रोफ़ाइल',
    roles: 'भूमिकाएँ', contactNotProvided: 'संपर्क जानकारी नहीं दी गई', history: 'इतिहास',
    freshFromOurFarm: 'हमारे खेत से ताज़ा', searchProductsPlaceholder: 'चिकन, मटन, अंडे खोजें...',
    freshFoodTagline: 'प्यार से उगाया गया अच्छा खाना।', shopFreshEssentials: 'Rawat Farm से ताज़ा मांस, पोल्ट्री, मछली और खेत के ज़रूरी सामान खरीदें।',
    freshDaily: 'हर दिन ताज़ा', shopTheMarket: 'बाज़ार देखें', popularToday: 'आज के लोकप्रिय उत्पाद', productCount: '{count} उत्पाद',
    category: 'श्रेणी', allCategories: 'सभी श्रेणियाँ', sort: 'क्रम', nameSort: 'नाम', lowPriceFirst: 'कीमत: कम से ज़्यादा',
    highPriceFirst: 'कीमत: ज़्यादा से कम', clearFilters: 'फ़िल्टर हटाएँ', noProductsMatch: 'इन फ़िल्टर से कोई उत्पाद नहीं मिला।',
    tryAnotherSearch: 'दूसरी खोज करें या सभी उत्पाद देखने के लिए फ़िल्टर हटाएँ।', soldBy: 'विक्रेता',
    qualityPackedFresh: 'गुणवत्ता जाँची गई और ताज़ा पैक किया गया।', onlyFewLeft: 'थोड़ा स्टॉक बचा है', available: 'उपलब्ध',
    inStock: 'स्टॉक में', unavailable: 'उपलब्ध नहीं', add: 'जोड़ें', addProductToCart: '{product} कार्ट में जोड़ें',
    productOutOfStock: '{product} स्टॉक में नहीं है', cart: 'कार्ट', itemsCount: '{count} सामान',
    cartWaiting: 'आपका कार्ट ताज़ा सामान का इंतज़ार कर रहा है।', browseProducts: 'उत्पाद देखें', checkout: 'खरीदारी पूरी करें',
    productAdded: '{product} कार्ट में जोड़ दिया गया।',
    decrease: 'कम करें', increase: 'बढ़ाएँ', remove: 'हटाएँ',
    paymentHistoryDescription: 'FarmMitra ऑर्डर के जारी और प्राप्त भुगतान।',
    staffCashHandovers: 'स्टाफ नकद जमा', handoverDescription: 'एडमिन द्वारा पुष्टि किए गए नकद हस्तांतरण ग्राहक भुगतान से अलग दर्ज होते हैं।',
    deliveryPartner: 'डिलीवरी पार्टनर', cashCollected: 'प्राप्त नकद', cashHandedOver: 'जमा नकद', availableCash: 'उपलब्ध नकद',
    selectPartner: 'पार्टनर चुनें', handoverAmount: 'जमा राशि', notes: 'टिप्पणी', recentHandovers: 'हाल के हस्तांतरण',
    handoverNumber: 'हस्तांतरण नंबर', receivedBy: 'प्राप्तकर्ता', noActivePartners: 'Rawat Farm का कोई सक्रिय डिलीवरी पार्टनर नहीं है।',
    noHandovers: 'नकद हस्तांतरण दर्ज नहीं हैं।', amountMustFitCash: 'सकारात्मक राशि दर्ज करें जो पार्टनर की उपलब्ध नकद राशि से अधिक न हो।',
    recordHandover: 'नकद हस्तांतरण दर्ज करें', recordingHandover: 'दर्ज हो रहा है...', handoverSuccess: 'नकद हस्तांतरण दर्ज हुआ। ग्राहक का बकाया नहीं बदला।',
    searchPaymentRecords: 'ऑर्डर नंबर, भुगतान आईडी, UPI संदर्भ', all: 'सभी',
    cashCollectedStatus: 'नकद प्राप्त', upiCollectedStatus: 'UPI प्राप्त', paymentId: 'भुगतान आईडी', business: 'व्यवसाय',
    upiReference: 'UPI संदर्भ', received: 'प्राप्त समय', loadingPayments: 'भुगतान रिकॉर्ड लोड हो रहे हैं...',
    noPaymentsMatch: 'फ़िल्टर से कोई भुगतान रिकॉर्ड नहीं मिला।',
    goodMorning: 'सुप्रभात, {name}', upiNotConfigured: 'Rawat Farm UPI कॉन्फ़िगर नहीं है। Admin Settings में सही UPI ID सहेजने तक नकद लें।',
    enterAmountWithinOutstanding: 'शून्य से अधिक और बकाया राशि से कम या बराबर राशि दर्ज करें।',
    upiReferenceRequired: 'UPI संदर्भ आईडी आवश्यक है।', deliveryCompleted: 'डिलीवरी पूरी हुई।', recorded: 'दर्ज हुआ',
    customerHistoryDescription: 'Rawat Farm ग्राहक, भुगतान और ऑर्डर का इतिहास', pricePerItem: 'प्रति सामान कीमत', lineTotal: 'लाइन का कुल',
  },
  hinglish: {
    dashboard: 'Dashboard', customers: 'Grahak', orders: 'Orders', paymentHistory: 'Payment History', outstandingBalance: 'Baaki Amount',
    collectPayment: 'Payment Jama Karo', cashHandover: 'Cash Admin Ko Jama Karo', applyFilter: 'Filter Lagao', downloadStatement: 'Statement Download Karo',
    products: 'Products', categories: 'Categories', units: 'Units', payments: 'Payments', delivery: 'Delivery', settings: 'Settings',
    account: 'Account', login: 'Login', logout: 'Log out', register: 'Register', signIn: 'Sign in', createAccount: 'Account Banao',
    emailOrMobile: 'Email ya mobile', password: 'Password', search: 'Search', filter: 'Filter', reset: 'Reset', loading: 'Load ho raha hai...',
    tryAgain: 'Phir se koshish karein', save: 'Save Karo', cancel: 'Cancel', confirm: 'Confirm Karo', date: 'Date', time: 'Time', amount: 'Amount',
    method: 'Tareeka', status: 'Status', orderNumber: 'Order number', product: 'Product', quantity: 'Quantity', unitPrice: 'Unit price',
    total: 'Total', paymentStatus: 'Payment status', orderStatus: 'Order status', deliveryStatus: 'Delivery status',
    totalOrders: 'Total orders', totalOrderValue: 'Order ka total amount', totalPaid: 'Total jama', totalPending: 'Total baaki',
    openingBalance: 'Shuru ka baaki', totalCharges: 'Total charges', totalPayments: 'Total payments', adjustments: 'Adjustments',
    closingBalance: 'Akhri baaki', debit: 'Debit', credit: 'Credit', transactionId: 'Transaction ID', description: 'Description',
    reference: 'Reference', collectedBy: 'Payment kisne liya', transactionStatus: 'Transaction status', noRecords: 'Koi record nahi mila.',
    day: 'Din', week: 'Hafta', month: 'Mahina', customDateRange: 'Custom date range', from: 'Se', to: 'Tak',
    previous: 'Pichhla', next: 'Agla', print: 'Print Karo', refresh: 'Refresh Karo', english: 'English', hindi: 'हिंदी', hinglish: 'Hinglish',
    cash: 'Cash', upi: 'UPI', customerKhata: 'Grahak Khata', financialSummary: 'Paise ka hisaab',
    orderHistory: 'Order history', customerSummary: 'Grahak ki jaankari', totalCollected: 'Total jama hua',
    openingBalanceNote: 'Shuru ka baaki is period se pehle ke transactions se calculate hota hai.', pageOf: 'Page {page} of {pages}',
    allTime: 'Ab tak', paymentRecorded: 'Payment record ho gaya', statementPeriod: 'Statement period', name: 'Naam', mobile: 'Mobile',
    address: 'Pata', paymentMethod: 'Payment ka tareeka', order: 'Order', outstanding: 'Baaki', viewKhata: 'Khata Dekho', email: 'Email',
    customerDetails: 'Grahak ki details', backToCustomers: 'Grahakon ke paas wapas', contactInfoAndAddresses: 'Contact aur delivery address',
    paymentDate: 'Payment ki date', recordedPayments: '{count} payment record hue', noCustomerPayments: 'Is grahak ke koi payment records nahi hain.',
    rawatFarmOrders: 'Rawat Farm ke {count} orders', noCustomerOrders: 'Is grahak ke orders nahi hain.', orderTotal: 'Order ka total',
    paymentCollected: 'Payment jama hua', notAssigned: 'Assign nahi hua', paymentCollections: 'Payment collections',
    outstandingPayments: 'Baaki payments', vendorDashboard: 'Vendor dashboard', vendorOrders: 'Vendor orders',
    deliveryDetails: 'Delivery details', productDetails: 'Product details', myOrders: 'Mere orders', orderDetails: 'Order details',
    inventory: 'Inventory', collections: 'Collections', khata: 'Khata',
    customerShop: 'Customer shop', signInToContinue: 'Aage badhne ke liye sign in karein',
    savedAddressesOrders: 'Apne saved address aur orders dekhein.', newCustomer: 'Naye grahak hain?',
    backToShop: 'Rawat Farm shop par wapas', createYourAccount: 'Apna account banayein',
    shopSignup: 'Rawat Farm se kharidari ke liye register karein.', fullName: 'Poora naam', mobileNumber: 'Mobile number',
    optionalEmail: 'Email (optional)', confirmPassword: 'Password confirm karein', existingCustomer: 'Pehle se account hai?',
    welcomeBack: 'Wapas swagat hai', adminOperations: 'Admin Operations', signInToManage: 'Rawat Farm operations manage karne ke liye sign in karein.',
    enterPassword: 'Apna password likhein', signingIn: 'Sign in ho raha hai...', readyForRoute: 'Aaj ke route ke liye ready hain?',
    deliveryAccountSignIn: 'Apne Rawat Farm delivery account se sign in karein.', thisDeliveryAccount: 'Yeh delivery partner account nahi hai',
    unableToSignIn: 'Sign in nahi ho paya', todayRoute: 'Aaj ka route ek nazar mein', signingInEllipsis: 'Sign in ho raha hai...',
    customerHome: 'Customer shop',
    backToOrders: 'Orders par wapas', deliveryDetail: 'Delivery details', customerAndAddress: 'Grahak aur address',
    deliveryAddress: 'Delivery address', items: 'Items', paymentSummary: 'Payment ka hisaab', collected: 'Jama hua',
    recordCollection: 'Payment record karo', transactionReferenceId: 'Transaction/reference ID', recording: 'Record ho raha hai...',
    accept: 'Accept Karo', accepting: 'Accept ho raha hai...', startDelivery: 'Delivery shuru karo', startingDelivery: 'Shuru ho raha hai...',
    completeDelivery: 'Delivery poori karo', completingDelivery: 'Poora ho raha hai...', loadingYourRoute: 'Aapka route load ho raha hai',
    routeUnavailable: 'Route available nahi', today: 'Aaj', yourRouteAtAGlance: 'Aaj ka route ek nazar mein',
    deliveries: 'Deliveries', completed: 'Poora hua', pending: 'Baaki', recentActivity: 'Recent activity',
    viewAll: 'Sab dekho', noDeliveriesAssigned: 'Abhi koi delivery assign nahi hui.', assignedOrders: 'Assigned orders',
    yourDeliveries: 'Aapki deliveries', outForDelivery: 'Delivery ke liye nikla', paymentPending: 'Payment baaki',
    noDeliveriesMatch: 'Is filter mein deliveries nahi hain.', balancesToCollect: 'Jama karne ke liye baaki',
    nothingOutstanding: 'Aapke assigned orders par kuch baaki nahi.', paymentHistoryHeading: 'Payment history',
    collectionsHeading: 'Collections', noPaymentCollections: 'Koi payment collection record nahi hui.',
    paymentCollection: 'Payment collection', ordersAwaitingPayment: 'Payment ka intezar kar rahe orders', assignedTo: 'Assigned hai',
    noDeliveryAssignment: 'Koi delivery partner assigned nahi hai', noCollectibleOrders: 'Collection ke liye koi Rawat Farm outstanding order nahi hai.',
    collectionUnavailable: 'Payment collection available nahi hai', profile: 'Profile',
    roles: 'Roles', contactNotProvided: 'Contact details nahi di', history: 'History',
    freshFromOurFarm: 'Hamare farm se fresh', searchProductsPlaceholder: 'Chicken, mutton, eggs search karein...',
    freshFoodTagline: 'Pyaar se paala hua accha khana.', shopFreshEssentials: 'Rawat Farm se fresh meat, poultry, fish aur farm essentials kharidein.',
    freshDaily: 'ROZ FRESH', shopTheMarket: 'MARKET DEKHEIN', popularToday: 'Aaj ke popular products', productCount: '{count} products',
    category: 'Category', allCategories: 'Sabhi categories', sort: 'Sort', nameSort: 'Naam', lowPriceFirst: 'Price: kam se zyada',
    highPriceFirst: 'Price: zyada se kam', clearFilters: 'Filters clear karein', noProductsMatch: 'In filters se koi product nahi mila.',
    tryAnotherSearch: 'Doosra search karein ya poora market dekhne ke liye filters hata dein.', soldBy: 'Bechne wala',
    qualityPackedFresh: 'Quality check karke fresh pack kiya gaya.', onlyFewLeft: 'Thode hi bache hain', available: 'Available',
    inStock: 'Stock mein', unavailable: 'Available nahi', add: 'Jodein', addProductToCart: '{product} cart mein jodein',
    productOutOfStock: '{product} stock mein nahi hai', cart: 'Cart', itemsCount: '{count} items',
    cartWaiting: 'Aapka cart fresh cheez ka wait kar raha hai.', browseProducts: 'Products dekhein', checkout: 'Checkout',
    productAdded: '{product} cart mein add hua.',
    decrease: 'Kam karein', increase: 'Badhaein', remove: 'Hataein',
    paymentHistoryDescription: 'FarmMitra orders ke issue aur collect hue payments.',
    staffCashHandovers: 'Staff cash handovers', handoverDescription: 'Admin-confirmed cash transfers customer payments se alag record hote hain.',
    deliveryPartner: 'Delivery partner', cashCollected: 'Cash jama hua', cashHandedOver: 'Cash handover hua', availableCash: 'Available cash',
    selectPartner: 'Partner chunein', handoverAmount: 'Handover amount', notes: 'Notes', recentHandovers: 'Recent handovers',
    handoverNumber: 'Handover number', receivedBy: 'Jisne receive kiya', noActivePartners: 'Rawat Farm ka koi active delivery partner nahi hai.',
    noHandovers: 'Koi cash handover record nahi hua.', amountMustFitCash: "Positive amount dein jo partner ke available cash se zyada na ho.",
    recordHandover: 'Cash handover record karein', recordingHandover: 'Record ho raha hai...', handoverSuccess: 'Cash handover record hua. Customer balance nahi badla.',
    searchPaymentRecords: 'Order number, payment ID, UPI ref', all: 'Sab',
    cashCollectedStatus: 'Cash jama hua', upiCollectedStatus: 'UPI jama hua', paymentId: 'Payment ID', business: 'Business',
    upiReference: 'UPI reference', received: 'Receive time', loadingPayments: 'Payment records load ho rahe hain...',
    noPaymentsMatch: 'Filters se koi payment record nahi mila.',
    goodMorning: 'Good morning, {name}', upiNotConfigured: 'Rawat Farm UPI set nahi hai. Admin Settings mein confirmed UPI ID save hone tak Cash use karein.',
    enterAmountWithinOutstanding: 'Zero se zyada aur outstanding balance se kam ya barabar amount dein.',
    upiReferenceRequired: 'UPI reference ID zaroori hai.', deliveryCompleted: 'Delivery complete hui.', recorded: 'Record hua',
    customerHistoryDescription: 'Rawat Farm grahak, payment aur order history', pricePerItem: 'Har item ka price', lineTotal: 'Line ka total',
  },
};

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (languages as readonly string[]).includes(value);

export const translate = (key: TranslationKey | string, language: Language = 'en', values: Record<string, string | number> = {}): string => {
  const value = translations[language][key as AnyTranslationKey] ?? translations.en[key as AnyTranslationKey] ?? key;
  return value.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
};

const englishKeyByText = new Map(Object.entries(translations.en).map(([key, value]) => [value.toLowerCase(), key]));
export const translateText = (text: string | undefined, language: Language): string => {
  if (!text || language === 'en') return text ?? '';
  const key = englishKeyByText.get(text.trim().toLowerCase());
  return key ? translate(key, language) : text;
};

export const localeForLanguage = (language: Language): string =>
  language === 'hi' ? 'hi-IN' : 'en-IN';

export const formatLocalizedCurrency = (amount: number | string, language: Language): string =>
  `₹${Number(amount || 0).toLocaleString(localeForLanguage(language))}`;

export const formatLocalizedDate = (value: string | Date, language: Language, options?: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(localeForLanguage(language), { timeZone: 'Asia/Kolkata', ...options }).format(new Date(value));
