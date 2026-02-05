// StockManagement.jsx
import React, { useState, useEffect, useRef } from "react";
import {
  Navbar,
  Nav,
  Container,
  Button,
  Modal,
  Form,
  Table,
  Row,
  Col,
  Pagination,
  InputGroup,
  Alert,
} from "react-bootstrap";
import { toast } from "react-toastify";
import axios from "axios";

// Import Redux hooks and actions
import { useDispatch, useSelector } from "react-redux";
import {
  selectAllProducts,
  selectProductsLoading,
  fetchAndIndexAllProducts,
} from "../../redux/slices/productSlice";
import indexedDb from "../../services/indexedDB";

// Base URL from your helpers
const BASE_URL = "https://api.arpellastore.com";

// API Service Object
const API = {
  categories: {
    list: () => axios.get(`${BASE_URL}/categories`).then(res => res.data),
    create: (data) => axios.post(`${BASE_URL}/categories`, data).then(res => res.data),
    update: (id, data) => axios.put(`${BASE_URL}/categories/${id}`, data).then(res => res.data),
    remove: (id) => axios.delete(`${BASE_URL}/categories/${id}`).then(res => res.data),
  },
  subcategories: {
    list: () => axios.get(`${BASE_URL}/subcategories`).then(res => res.data),
    create: (data) => axios.post(`${BASE_URL}/subcategories`, data).then(res => res.data),
    update: (id, data) => axios.put(`${BASE_URL}/subcategories/${id}`, data).then(res => res.data),
    remove: (id) => axios.delete(`${BASE_URL}/subcategories/${id}`).then(res => res.data),
  },
  suppliers: {
    list: () => axios.get(`${BASE_URL}/suppliers`).then(res => res.data),
    create: (data) => axios.post(`${BASE_URL}/suppliers`, data).then(res => res.data),
    update: (id, data) => axios.put(`${BASE_URL}/suppliers/${id}`, data).then(res => res.data),
    remove: (id) => axios.delete(`${BASE_URL}/suppliers/${id}`).then(res => res.data),
  },
  inventories: {
    list: () => axios.get(`${BASE_URL}/inventories`).then(res => res.data),
    paged: (page, size) => axios.get(`${BASE_URL}/inventories?pageNumber=${page}&pageSize=${size}`).then(res => res.data),
    create: (data) => axios.post(`${BASE_URL}/inventory`, data).then(res => res.data),
    update: (id, data) => axios.put(`${BASE_URL}/inventory/${id}`, data).then(res => res.data),
    remove: (id) => axios.delete(`${BASE_URL}/inventories/${id}`).then(res => res.data),
    uploadExcel: (formData) => axios.post(`${BASE_URL}/inventories/upload-excel`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data),
  },
  products: {
    list: () => axios.get(`${BASE_URL}/products`).then(res => res.data),
    paged: (page, size) => axios.get(`${BASE_URL}/pos-paged-products?pageNumber=${page}&pageSize=${size}`).then(res => res.data),
    get: (id) => axios.get(`${BASE_URL}/products/${id}`).then(res => res.data),
    create: (data) => axios.post(`${BASE_URL}/product`, data).then(res => res.data),
    update: (id, data) => axios.put(`${BASE_URL}/product/${id}`, data).then(res => res.data),
    remove: (id) => axios.delete(`${BASE_URL}/products/${id}`).then(res => res.data),
    uploadImage: (formData) => axios.post(`${BASE_URL}/products/upload-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data),
    uploadExcel: (formData) => axios.post(`${BASE_URL}/products/upload-excel`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data),
  },
  invoices: {
    list: () => axios.get(`${BASE_URL}/invoices`).then(res => res.data),
    paged: (page, size) => axios.get(`${BASE_URL}/invoices?pageNumber=${page}&pageSize=${size}`).then(res => res.data),
    create: (data) => axios.post(`${BASE_URL}/invoices`, data).then(res => res.data),
    update: (id, data) => axios.put(`${BASE_URL}/invoices/${id}`, data).then(res => res.data),
    remove: (id) => axios.delete(`${BASE_URL}/invoices/${id}`).then(res => res.data),
  },
  restockLog: {
    list: () => axios.get(`${BASE_URL}/restock-log`).then(res => res.data),
    create: (data) => axios.post(`${BASE_URL}/restock-log`, data).then(res => res.data),
  },
  goodsInfo: {
    create: (data) => axios.post(`${BASE_URL}/goods-info`, data).then(res => res.data),
    update: (id, data) => axios.put(`${BASE_URL}/goods-info/${id}`, data).then(res => res.data),
  }
};

const SEARCH_DEBOUNCE_MS = 300;


const StockManagement = () => {
  // const dispatch = useDispatch();
  // const reduxProducts = useSelector(selectAllProducts);
  // const reduxLoading = useSelector(selectProductsLoading);

  const dispatch = useDispatch();
  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showAddCompleteProductModal, setShowAddCompleteProductModal] = useState(false);
  const [isEditingCompleteProduct, setIsEditingCompleteProduct] = useState(false); // New state for edit mode
  const [showImageUploadModal, setShowImageUploadModal] = useState(false);
  const [showSubCategoryModal, setShowSubCategoryModal] = useState(false);
  const [showStockExcelModal, setShowStockExcelModal] = useState(false);
  const [showProductsExcelModal, setShowProductsExcelModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showEditStockModal, setShowEditStockModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showEditSupplierModal, setShowEditSupplierModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [searchTerm]);

  // Active view
  const [activeView, setActiveView] = useState("stocks");

  // File input ref
  const fileInputRef = useRef(null);

  // Pagination
  const pageSize = 25;
  const [currentInventoryPage, setCurrentInventoryPage] = useState(1);
  const [inventoryJumpPage, setInventoryJumpPage] = useState("");
  const [hasMoreInventories, setHasMoreInventories] = useState(true);
  const [lastInventoryPage, setLastInventoryPage] = useState(1);

  const [currentProductPage, setCurrentProductPage] = useState(1);
  const [productJumpPage, setProductJumpPage] = useState("");
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [lastProductPage, setLastProductPage] = useState(1);

  const [currentInvoicePage, setCurrentInvoicePage] = useState(1);
  const [invoiceJumpPage, setInvoiceJumpPage] = useState("");
  const [hasMoreInvoices, setHasMoreInvoices] = useState(true);

  // Restock pagination
  const [restockProductPage, setRestockProductPage] = useState(1);
  const [hasMoreRestockProducts, setHasMoreRestockProducts] = useState(true);
  const [restockSearch, setRestockSearch] = useState("");
  const [restockSearchResults, setRestockSearchResults] = useState([]);
  const [allRestockProducts, setAllRestockProducts] = useState([]);
  const restockSearchTimeout = useRef(null);

  // Excel files
  const [stockExcelFile, setStockExcelFile] = useState(null);
  const [productsExcelFile, setProductsExcelFile] = useState(null);

  // Data lists
  const [inventories, setInventories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [invoices, setInvoices] = useState([]);

  // Restock form
  const [restockMeta, setRestockMeta] = useState({ invoiceNumber: "", supplierId: "" });
  const [restockEntries, setRestockEntries] = useState([{ productId: "", restockQuantity: "", purchasePrice: "" }]);

  // Supplier form
  const [supplierData, setSupplierData] = useState({ supplierName: "", kraPin: "" });
  const [editingSupplier, setEditingSupplier] = useState({ id: null, supplierName: "", kraPin: "" });

  // Product edit
  const [editProductData, setEditProductData] = useState({
    Id: null,
    inventoryId: "",
    name: "",
    price: "",
    priceAfterDiscount: "",
    purchaseCap: "",
    discountQuantity: "",
    barcodes: "",
    categoryId: null,
    subCategoryId: null,
    showOnline: false,
  });

  // Complete product form
  const [completeProductForm, setCompleteProductForm] = useState({
    inventoryId: "",
    initialQuantity: "",
    initialPrice: "",
    threshold: "",
    supplierId: "",
    invoiceNumber: "",
    name: "",
    price: "",
    priceAfterDiscount: "",
    barcodes: "",
    purchaseCap: "",
    discountQuantity: "",
    categoryId: null,
    subCategoryId: null,
    showOnline: false,
    taxRate: "",
    ItemDescription: "",
    unitMeasure: "",
    ItemCode: "",
    id: null,
  });

  const [formErrors, setFormErrors] = useState({});

  // Image upload
  const [imageData, setImageData] = useState({ isPrimary: false, image: null });
  const [uploadProductId, setUploadProductId] = useState(null);

  const [editStockData, setEditStockData] = useState(null);

  // Small helpers
  const [categoryName, setCategoryName] = useState("");
  const [subCategoryData, setSubCategoryData] = useState({ subcategoryName: "", categoryId: null });
  const [invoiceForm, setInvoiceForm] = useState({ invoiceId: "", totalAmount: "", supplierId: "" });

  // Toast helper
  const showToastMessage = (message, variant = "info") => {
    switch (variant) {
      case "success":
        toast.success(message);
        break;
      case "danger":
      case "error":
        toast.error(message);
        break;
      case "warning":
        toast.warn(message);
        break;
      default:
        toast.info(message);
    }
  };

  // Generic paged fetch helper
  const safePagedFetch = async (serviceObj, page = 1) => {
    if (!serviceObj) return [];
    if (typeof serviceObj.paged === "function") {
      return await serviceObj.paged(page, pageSize);
    }
    if (typeof serviceObj.list === "function") {
      const all = await serviceObj.list();
      const start = (page - 1) * pageSize;
      return (Array.isArray(all) ? all.slice(start, start + pageSize) : []);
    }
    return [];
  };

  // Fetch data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [cats, sups, subcats] = await Promise.all([
        API.categories.list().catch(() => []),
        API.suppliers.list().catch(() => []),
        API.subcategories.list().catch(() => []),
      ]);
      setCategories(cats || []);
      setSuppliers(sups || []);
      setSubCategories(subcats || []);

      const invs = await (API.invoices?.list ? API.invoices.list().catch(() => []) : []);
      setInvoices(invs || []);
    } catch (error) {
      showToastMessage("Failed to fetch data: " + (error?.message || "Unknown error"), "danger");
    } finally {
      setIsLoading(false);
    }
  };

  const [allInventories, setAllInventories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);

  useEffect(() => {
    // 1. Sync products on mount
    dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: false }))
      .unwrap()
      .then(() => {
        // 2. Load data from IDB
        loadDataFromIDB();
      })
      .catch((err) => {
        console.error("Sync failed", err);
        // still try to load what we have
        loadDataFromIDB();
      });
    fetchData();
    setActiveView("stocks");
  }, [dispatch]);

  const loadDataFromIDB = async () => {
    try {
      const [invs, prods] = await Promise.all([
        indexedDb.getAllInventories({ limit: 10000 }),
        indexedDb.getAllProducts(),
      ]);

      // Create Product Map for Name Lookup
      const productMap = new Map();
      (prods || []).forEach(p => {
        // Key by both id and inventoryId to be safe
        if (p.id) productMap.set(String(p.id), p);
        if (p.inventoryId) productMap.set(String(p.inventoryId), p);
      });

      // Deduplicate inventories by productId
      // Prioritize records with Quantity > 0, then by latest UpdatedAt
      const uniqueMap = new Map();
      (invs || []).forEach(inv => {
        const pId = String(inv.productId || inv.product_id || inv.inventoryId); // Fallback to inventoryId if no productId

        // Enrich Name if missing
        if (!inv.productName && !inv.raw?.name) {
          const p = productMap.get(pId);
          if (p) {
            inv.productName = p.name || p.productName || "";
          }
        }

        if (!uniqueMap.has(pId)) {
          uniqueMap.set(pId, inv);
        } else {
          const existing = uniqueMap.get(pId);
          // 1. Prefer strictly positive quantity over 0
          const currentHasQty = Number(inv.stockQuantity) > 0;
          const existingHasQty = Number(existing.stockQuantity) > 0;

          if (currentHasQty && !existingHasQty) {
            uniqueMap.set(pId, inv);
          } else if (currentHasQty === existingHasQty) {
            // 2. Tie-breaker: latest updatedAt
            const curTime = new Date(inv.updatedAt || 0).getTime();
            const exTime = new Date(existing.updatedAt || 0).getTime();
            if (curTime > exTime) {
              uniqueMap.set(pId, inv);
            }
          }
        }
      });

      const uniqueInvs = Array.from(uniqueMap.values());
      setAllInventories(uniqueInvs);
      setAllProducts(prods || []);

      // Initialize lists
      setInventories(uniqueInvs.slice(0, pageSize));
      setProducts((prods || []).slice(0, pageSize));
      setHasMoreInventories(uniqueInvs.length > pageSize);
      setHasMoreProducts((prods || []).length > pageSize);
    } catch (e) {
      console.error("Failed to load IDB data", e);
    }
  };

  // Search Effect
  useEffect(() => {
    const term = debouncedSearchTerm.trim().toLowerCase();

    // Filter Inventories
    let filteredInvs = allInventories;
    if (term) {
      filteredInvs = allInventories.filter(i => {
        const pName = i.raw?.name || i.productName || "";
        const pId = i.productId || i.inventoryId || "";
        return String(pName).toLowerCase().includes(term) || String(pId).toLowerCase().includes(term);
      });
    }
    // Update Inventory Page 1
    setCurrentInventoryPage(1);
    const invSlice = filteredInvs.slice(0, pageSize);
    setInventories(invSlice);
    setHasMoreInventories(filteredInvs.length > pageSize);

    // Filter Products
    let filteredProds = allProducts;
    if (term) {
      filteredProds = allProducts.filter(p => {
        const name = p.name || "";
        const id = p.id || p.inventoryId || "";
        const barcodeStr = p.barcode ? String(p.barcode) : (Array.isArray(p.barcodes) ? p.barcodes.join(" ") : String(p.barcodes || ""));
        return String(name).toLowerCase().includes(term) || String(id).toLowerCase().includes(term) || String(barcodeStr).toLowerCase().includes(term);
      });
    }
    // Update Product Page 1
    setCurrentProductPage(1);
    const prodSlice = filteredProds.slice(0, pageSize);
    setProducts(prodSlice);
    setHasMoreProducts(filteredProds.length > pageSize);

  }, [debouncedSearchTerm, allInventories, allProducts]);

  // Fetch stocks (Local Pagination)
  const fetchStocks = (page = 1) => {
    const term = debouncedSearchTerm.trim().toLowerCase();
    let source = allInventories;
    if (term) {
      source = allInventories.filter(i => {
        const pName = i.raw?.name || i.productName || "";
        const pId = i.productId || i.inventoryId || "";
        return String(pName).toLowerCase().includes(term) || String(pId).toLowerCase().includes(term);
      });
    }
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setInventories(source.slice(start, end));
    setHasMoreInventories(source.length > end);
    setLastInventoryPage(page);
  };


  useEffect(() => {
    fetchStocks(currentInventoryPage);
  }, [currentInventoryPage]);

  const handleInventoryPageChange = (page) => {
    if (page >= 1 && (page < currentInventoryPage || hasMoreInventories)) {
      setCurrentInventoryPage(page);
    }
  };

  const handleInventoryJumpToPage = () => {
    const page = parseInt(inventoryJumpPage);
    if (!isNaN(page) && page >= 1) {
      setCurrentInventoryPage(page);
      setInventoryJumpPage("");
    }
  };

  // Fetch products (Local Pagination)
  // Fetch products (Local Pagination)
  const fetchProducts = (page = 1) => {
    const term = debouncedSearchTerm.trim().toLowerCase();
    let source = allProducts;
    if (term) {
      source = allProducts.filter(p => {
        const name = p.name || "";
        const id = p.id || p.inventoryId || "";
        const barcodeStr = p.barcode ? String(p.barcode) : (Array.isArray(p.barcodes) ? p.barcodes.join(" ") : String(p.barcodes || ""));
        return String(name).toLowerCase().includes(term) || String(id).toLowerCase().includes(term) || String(barcodeStr).toLowerCase().includes(term);
      });
    }
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setProducts(source.slice(start, end));
    setHasMoreProducts(source.length > end);
    setLastProductPage(page);
  };


  useEffect(() => {
    fetchProducts(currentProductPage);
  }, [currentProductPage]);

  const handleProductPageChange = (page) => {
    if (page >= 1 && (page < currentProductPage || hasMoreProducts)) {
      setCurrentProductPage(page);
    }
  };

  const handleProductJumpToPage = () => {
    const page = parseInt(productJumpPage);
    if (!isNaN(page) && page >= 1) {
      setCurrentProductPage(page);
      setProductJumpPage("");
    }
  };

  // Fetch invoices
  const fetchInvoicesPaged = async (page = 1) => {
    try {
      let data = [];
      if (typeof API.invoices?.paged === "function") {
        data = await API.invoices.paged(page, pageSize);
      } else if (typeof API.invoices?.list === "function") {
        const all = await API.invoices.list();
        const start = (page - 1) * pageSize;
        data = (Array.isArray(all) ? all.slice(start, start + pageSize) : []);
      }
      setInvoices((data || []));
      setHasMoreInvoices((data || []).length === pageSize);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      showToastMessage("Failed to fetch invoices", "danger");
    }
  };

  const handleInvoicePageChange = (page) => {
    if (page >= 1 && (page < currentInvoicePage || hasMoreInvoices)) {
      setCurrentInvoicePage(page);
      fetchInvoicesPaged(page);
    }
  };

  const handleInvoiceJumpToPage = () => {
    const page = parseInt(invoiceJumpPage);
    if (!isNaN(page) && page >= 1) {
      setCurrentInvoicePage(page);
      setInvoiceJumpPage("");
      fetchInvoicesPaged(page);
    }
  };

  // Restock products
  const fetchRestockProducts = async (page = 1, append = false) => {
    try {
      const data = await safePagedFetch(API.inventories, page);
      if (append) {
        setAllRestockProducts((prev) => [...prev, ...(data || [])]);
      } else {
        setAllRestockProducts(data || []);
      }
      setHasMoreRestockProducts((data || []).length === pageSize);
    } catch (err) {
      console.error("Error fetching restock products:", err);
    }
  };

  useEffect(() => {
    if (showRestockModal) {
      setRestockProductPage(1);
      fetchRestockProducts(1, false);
    }
  }, [showRestockModal]);

  const loadMoreRestockProducts = async () => {
    if (!hasMoreRestockProducts) return;
    const next = restockProductPage + 1;
    setRestockProductPage(next);
    await fetchRestockProducts(next, true);
  };

  useEffect(() => {
    if (restockSearchTimeout.current) clearTimeout(restockSearchTimeout.current);
    restockSearchTimeout.current = setTimeout(() => {
      const q = (restockSearch || "").trim().toLowerCase();
      if (!q) {
        setRestockSearchResults(allRestockProducts.slice(0, 50));
      } else {
        setRestockSearchResults(
          allRestockProducts
            .filter((inv) => {
              const pid = (inv.productId || "").toString().toLowerCase();
              const name = ((inv.productName || inv.name) || "").toString().toLowerCase();
              return pid.includes(q) || name.includes(q);
            })
            .slice(0, 200)
        );
      }
    }, 200);
    return () => {
      if (restockSearchTimeout.current) clearTimeout(restockSearchTimeout.current);
    };
  }, [restockSearch, allRestockProducts]);

  const pickRestockProduct = (entryIndex, productId) => {
    updateRestockEntry(entryIndex, "productId", productId);
  };

  // Fetch suppliers
  const fetchSuppliers = async () => {
    setIsLoading(true);
    try {
      const data = await (API.suppliers?.list ? API.suppliers.list() : []);
      setSuppliers(data || []);
      setActiveView("suppliers");
    } catch (error) {
      showToastMessage("Failed to fetch suppliers: " + (error?.message || "Unknown error"), "danger");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch invoices
  const fetchInvoices = async () => {
    try {
      const data = await (API.invoices?.list ? API.invoices.list() : []);
      setInvoices(data || []);
      setActiveView("invoice");
    } catch (err) {
      console.error(err);
      showToastMessage("Failed to fetch invoices", "danger");
    }
  };

  // Utility handlers
  const addRestockEntry = () => {
    setRestockEntries([...restockEntries, { productId: "", restockQuantity: "", purchasePrice: "" }]);
  };

  const removeRestockEntry = (index) => {
    const updated = [...restockEntries];
    updated.splice(index, 1);
    setRestockEntries(updated);
  };

  const updateRestockEntry = (index, field, value) => {
    const updated = [...restockEntries];
    updated[index][field] = value;
    setRestockEntries(updated);
  };

  const resetForms = () => {
    setCompleteProductForm({
      inventoryId: "",
      initialQuantity: "",
      initialPrice: "",
      threshold: "",
      supplierId: "",
      invoiceNumber: "",
      name: "",
      price: "",
      priceAfterDiscount: "",
      barcodes: "",
      purchaseCap: "",
      discountQuantity: "",
      categoryId: null,
      subCategoryId: null,
      showOnline: false,
      taxRate: "",
      ItemDescription: "",
      unitMeasure: "",
      ItemCode: "",
    });
    setCategoryName("");
    setImageData({ isPrimary: false, image: null });
    setSupplierData({ supplierName: "", kraPin: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setStockExcelFile(null);
    setProductsExcelFile(null);
    setFormErrors({});
    setIsEditingCompleteProduct(false); // Reset edit mode
  };

  // Add category
  const handleAddCategory = async (e) => {
    e?.preventDefault?.();
    try {
      setIsLoading(true);
      if (!categoryName.trim()) throw new Error("Category name is required");
      await API.categories.create({ categoryName });
      showToastMessage("Category added successfully", "success");
      setShowCategoryModal(false);
      resetForms();
      const catRes = await API.categories.list();
      setCategories(catRes || []);
    } catch (error) {
      showToastMessage("Failed to add category: " + (error?.message || "error"), "danger");
    } finally {
      setIsLoading(false);
    }
  };

  // Add subcategory
  const handleAddSubCategory = async (e) => {
    e?.preventDefault?.();
    try {
      setIsLoading(true);
      if (!subCategoryData.subcategoryName.trim() || subCategoryData.categoryId === null) {
        throw new Error("Subcategory name and category are required");
      }
      await API.subcategories.create(subCategoryData);
      showToastMessage("Subcategory added successfully", "success");
      setShowSubCategoryModal(false);
      const subCatRes = await API.subcategories.list();
      setSubCategories(subCatRes || []);
    } catch (error) {
      showToastMessage("Failed to add subcategory: " + (error?.message || "error"), "danger");
    } finally {
      setIsLoading(false);
    }
  };

  // Add supplier
  const handleAddSupplier = async () => {
    try {
      setIsLoading(true);
      if (!supplierData.supplierName.trim() || !supplierData.kraPin.trim()) {
        throw new Error("Supplier name and KRA Pin are required");
      }
      await API.suppliers.create(supplierData);
      showToastMessage("Supplier added successfully", "success");
      setShowSupplierModal(false);
      setSupplierData({ supplierName: "", kraPin: "" });
      fetchSuppliers();
    } catch (error) {
      showToastMessage("Failed to add supplier: " + (error?.message || "error"), "danger");
    } finally {
      setIsLoading(false);
    }
  };

  // Update supplier
  const handleUpdateSupplier = async () => {
    try {
      setIsLoading(true);
      await API.suppliers.update(editingSupplier.id, {
        supplierName: editingSupplier.supplierName,
        kraPin: editingSupplier.kraPin,
      });
      fetchSuppliers();
      showToastMessage("Supplier updated successfully", "success");
    } catch (error) {
      console.error(error);
      showToastMessage("Failed to update supplier", "danger");
    } finally {
      setShowEditSupplierModal(false);
      setIsLoading(false);
    }
  };

  // Delete supplier
  const handleDeleteSupplier = async (id) => {
    try {
      setIsLoading(true);
      await API.suppliers.remove(id);
      showToastMessage("Supplier deleted successfully", "success");
    } catch (error) {
      console.error(error);
      showToastMessage("Failed to delete supplier", "danger");
    } finally {
      fetchSuppliers();
      setIsLoading(false);
    }
  };

  // Edit supplier
  const handleEditSupplier = (id) => {
    const supplier = suppliers.find((s) => s.id === id);
    if (supplier) {
      setEditingSupplier(supplier);
      setShowEditSupplierModal(true);
    }
  };

  // Edit product
  const handleEditShow = async (product) => {
    try {
      setIsLoading(true);
      setLastProductPage(currentProductPage);

      const resp = await (API.products?.get ? API.products.get(product.id) : Promise.resolve(product));
      const p = Array.isArray(resp) ? resp[0] : resp;
      const source = p || product;
      setEditProductData({
        Id: source.id,
        inventoryId: source.inventoryId ?? product.inventoryId,
        name: source.name ?? product.name,
        price: source.price ?? product.price,
        priceAfterDiscount: source.priceAfterDiscount ?? product.priceAfterDiscount,
        categoryId: source.category ?? product.category,
        subCategoryId: source.subcategory ?? product.subcategory,
        purchaseCap: source.purchaseCap ?? product.purchaseCap,
        discountQuantity: source.discountQuantity ?? product.discountQuantity,
        barcodes: source.barcodes ?? product.barcodes,
        showOnline: !!(source.showOnline ?? product.showOnline),
      });
      setShowEditModal(true);
    } catch (err) {
      showToastMessage("Failed to load product for editing", "danger");
    } finally {
      setIsLoading(false);
    }
  };
  const renderSubCategoryOptionsFor = (categoryId) => {
    // defensive: ensure subCategories is an array
    const list = Array.isArray(subCategories) ? subCategories : [];

    if (!categoryId) {
      // used when no category selected
      return [<option key="none" value="">Select a category first</option>];
    }

    const matched = list.filter((sc) => {
      // normalize several possible keys
      const scCat = sc.categoryId ?? sc.category ?? sc.CategoryId ?? sc.catId ?? sc.parentId;
      return String(scCat) === String(categoryId);
    });

    if (!matched.length) {
      return [<option key="empty" value="">No subcategories</option>];
    }

    return matched.map((sc) => (
      <option
        key={sc.id ?? sc.subcategoryId ?? sc._id ?? `${sc.name}-${Math.random()}`}
        value={sc.id ?? sc.subcategoryId ?? sc._id}
      >
        {sc.subcategoryName ?? sc.name ?? sc.title ?? "Unnamed"}
      </option>
    ));
  };


  const handleEditClose = () => {
    if (!isLoading) setShowEditModal(false);
  };

  const handleEditProduct = async () => {
    try {
      setIsLoading(true);
      if (!editProductData.name || editProductData.price === "" || !editProductData.inventoryId || editProductData.categoryId === null || editProductData.subCategoryId === null) {
        throw new Error("All required product fields must be filled");
      }
      const payload = {
        inventoryId: editProductData.inventoryId,
        purchaseCap: editProductData.purchaseCap,
        category: editProductData.categoryId,
        subcategory: editProductData.subCategoryId,
        name: editProductData.name,
        price: editProductData.price,
        barcodes: editProductData.barcodes,
        showOnline: !!editProductData.showOnline,
        discountQuantity: editProductData.discountQuantity,
        priceAfterDiscount: editProductData.priceAfterDiscount,
      };
      await API.products.update(editProductData.Id, payload);
      showToastMessage("Product updated successfully", "success");
      setShowEditModal(false);
      fetchProducts(lastProductPage, true);
      setCurrentProductPage(lastProductPage);
    } catch (error) {
      console.error(error);
      showToastMessage("Failed to update product: " + (error?.message || "error"), "danger");
    } finally {
      setIsLoading(false);
    }
  };

  // Image upload
  const openUploadModal = (productId) => {
    setUploadProductId(productId);
    setImageData({ isPrimary: false, image: null });
    setShowImageUploadModal(true);
  };

  const handleChooseFile = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) setImageData({ ...imageData, image: file });
  };

  const handleUploadImage = async () => {
    if (!imageData.image || !uploadProductId) {
      alert("Please select an image and product first");
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", imageData.image);
      formData.append("productId", uploadProductId);
      formData.append("isPrimary", imageData.isPrimary ? "true" : "false");
      await API.products.uploadImage(formData);
      setShowImageUploadModal(false);
      showToastMessage("Image uploaded successfully", "success");
    } catch (error) {
      console.error("Error uploading image:", error);
      showToastMessage("Failed to upload image", "danger");
    } finally {
      setIsLoading(false);
    }
  };

  // Excel uploads
  const handleUploadProductsExcel = async () => {
    if (!productsExcelFile) return;
    try {
      setIsLoading(true);
      const formData = new FormData();
      formData.append("file", productsExcelFile);
      // Use the products endpoint (was calling inventories.uploadExcel)
      await API.products.uploadExcel(formData);
      showToastMessage("Products Excel uploaded successfully", "success");
      setShowProductsExcelModal(false);
      setProductsExcelFile(null);
    } catch (error) {
      showToastMessage("Failed to upload Products Excel: " + (error?.message || "error"), "danger");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadStockExcel = async () => {
    if (!stockExcelFile) return;
    try {
      setIsLoading(true);
      const formData = new FormData();
      formData.append("excelFile", stockExcelFile);
      await API.inventories.uploadExcel(formData);
      showToastMessage("Stock Excel uploaded successfully", "success");
      setShowStockExcelModal(false);
    } catch (error) {
      console.error("Upload failed:", error);
      showToastMessage(`Failed to upload Stock Excel: ${error?.message || "error"}`, "danger");
    } finally {
      setIsLoading(false);
    }
  };

  // Restock
  const resetRestockForm = () => {
    setRestockMeta({ invoiceNumber: "", supplierId: "" });
    setRestockEntries([{ productId: "", restockQuantity: "", purchasePrice: "" }]);
  };

  const handleAddRestock = async () => {
    if (!restockMeta.invoiceNumber || !restockMeta.supplierId) {
      toast.error("Supplier and invoice are required.");
      return;
    }
    try {
      setIsLoading(true);
      for (const entry of restockEntries) {
        const payload = {
          invoiceNumber: restockMeta.invoiceNumber,
          supplierId: restockMeta.supplierId,
          productId: entry.productId,
          restockQuantity: entry.restockQuantity,
          purchasePrice: entry.purchasePrice,
        };
        await API.restockLog.create(payload);
      }
      toast.success("All restock entries added.");
      setShowRestockModal(false);
      resetRestockForm();
      fetchStocks(currentInventoryPage, true);
    } catch (error) {
      console.error(error);
      toast.error("An error occurred while saving restocks.");
    } finally {
      setIsLoading(false);
    }
  };

  // Edit stock
  const handleEditStock = (stock) => {
    setLastInventoryPage(currentInventoryPage);
    setEditStockData(stock);
    setShowEditStockModal(true);
  };

  // Validation
  const validateCompleteProductForm = () => {
    const f = completeProductForm;
    const errors = {};

    if (!f.inventoryId || String(f.inventoryId).trim() === "")
      errors.inventoryId = "Inventory Product ID is required";

    if (f.initialQuantity === "" || f.initialQuantity === null || isNaN(Number(f.initialQuantity))) {
      errors.initialQuantity = "Initial quantity is required and must be a number";
    } else if (Number(f.initialQuantity) < 0) {
      errors.initialQuantity = "Initial quantity cannot be negative";
    }

    if (f.initialPrice === "" || f.initialPrice === null || isNaN(Number(f.initialPrice))) {
      errors.initialPrice = "Initial purchase price is required and must be a number";
    } else if (Number(f.initialPrice) < 0) {
      errors.initialPrice = "Initial purchase price cannot be negative";
    }

    if (f.threshold === "" || f.threshold === null || isNaN(Number(f.threshold))) {
      errors.threshold = "Threshold is required and must be a number";
    } else if (Number(f.threshold) < 0) {
      errors.threshold = "Threshold cannot be negative";
    }

    if (!f.supplierId || String(f.supplierId).trim() === "")
      errors.supplierId = "Supplier is required";

    if (!f.invoiceNumber || String(f.invoiceNumber).trim() === "")
      errors.invoiceNumber = "Invoice number is required";

    if (!f.name || String(f.name).trim() === "")
      errors.name = "Product name is required";

    if (f.price === "" || f.price === null || isNaN(Number(f.price))) {
      errors.price = "Price is required and must be a number";
    } else if (Number(f.price) < 0) {
      errors.price = "Price cannot be negative";
    }

    if (f.priceAfterDiscount === "" || f.priceAfterDiscount === null || isNaN(Number(f.priceAfterDiscount))) {
      errors.priceAfterDiscount = "Price after discount is required and must be a number";
    } else if (Number(f.priceAfterDiscount) < 0) {
      errors.priceAfterDiscount = "Price after discount cannot be negative";
    }

    if (!f.barcodes || String(f.barcodes).trim() === "")
      errors.barcodes = "Barcode is required";

    if (!f.discountQuantity || String(f.discountQuantity).trim() === "")
      errors.discountQuantity = "Discount quantity is required";

    if (f.categoryId === null || f.categoryId === "")
      errors.categoryId = "Category is required";

    if (f.subCategoryId === null || f.subCategoryId === "")
      errors.subCategoryId = "Subcategory is required";

    if (f.purchaseCap === "" || f.purchaseCap === null || isNaN(Number(f.purchaseCap))) {
      errors.purchaseCap = "Purchase cap is required and must be a number";
    } else if (Number(f.purchaseCap) < 1) {
      errors.purchaseCap = "Purchase cap must be at least 1";
    }

    if (f.taxRate && isNaN(Number(f.taxRate))) {
      errors.taxRate = "Tax rate must be a valid number";
    }

    return errors;
  };

  // Pre-fill form for Editing
  const handleEditCompleteProduct = (product) => {
    setIsEditingCompleteProduct(true);
    setFormErrors({});

    // Find related inventory
    const inv = inventories.find(i => String(i.productId || i.inventoryId) === String(product.inventoryId || product.id));
    // Find related supplier
    const supplierId = inv?.supplierId || product.SupplierId;

    // Set the product ID for the update API
    setEditProductData({ ...editProductData, Id: product.id });

    // Find related Tax (if available in a list, otherwise default or partial)
    // Note: We might not have a full taxList loaded. If we do, find by productId.
    // If not, we might need to fetch it or just leave fields blank/optional.
    // For now, assume taxList might be empty or incomplete, we'll try to find it.
    // Assuming 'taxData' view fetches something, but better to rely on what we have.

    setCompleteProductForm({
      id: product.id,
      inventoryId: product.inventoryId || product.id,
      initialQuantity: inv ? inv.stockQuantity : 0,
      initialPrice: inv ? inv.stockPrice : 0,
      threshold: inv ? inv.stockThreshold : 0,
      supplierId: supplierId || "",
      invoiceNumber: inv?.invoiceNumber || "",
      name: product.name,
      barcodes: product.barcodes,
      price: product.price,
      priceAfterDiscount: product.priceAfterDiscount || 0,
      discountQuantity: product.discountQuantity || 0,
      categoryId: product.category ? Number(product.category) : null,
      subCategoryId: product.subcategory ? Number(product.subcategory) : null,
      purchaseCap: product.purchaseCap || 1,
      showOnline: product.showOnline,

      // Tax fields - try to map if present in product or separate list
      // If product has tax fields directly (some backends do this):
      ItemCode: product.ItemCode || "",
      taxRate: product.taxRate || 0,
      ItemDescription: product.ItemDescription || "",
      unitMeasure: product.unitMeasure || "",
    });

    setShowAddCompleteProductModal(true);
  };

  // Add OR Update complete product
  const handleAddCompleteProduct = async () => {
    setIsSubmitting(true);

    // Validate form
    const errors = validateCompleteProductForm();
    if (Object.keys(errors).length > 0) {
      // Filter errors if in edit mode (ignore hidden fields)
      if (isEditingCompleteProduct) {
        // We want to validate these if we are updating them independently
        // delete errors.initialQuantity;
        // delete errors.initialPrice;
        // delete errors.threshold;
        // delete errors.supplierId;
        // delete errors.invoiceNumber;
        // delete errors.taxRate;
        // delete errors.ItemCode;
        // delete errors.ItemDescription;
        // delete errors.unitMeasure;

        if (Object.keys(errors).length > 0) {
          setFormErrors(errors);
          showToastMessage("Please fix validation errors", "danger");
          setIsSubmitting(false);
          return;
        }
      } else {
        setFormErrors(errors);
        showToastMessage("Please fix validation errors", "danger");
        setIsSubmitting(false);
        return;
      }
    }

    setIsLoading(true);

    // EDIT MODE
    if (isEditingCompleteProduct) {
      try {
        const f = completeProductForm;
        const productId = editProductData.Id || f.id; // Using the primary ID for the product endpoint

        // 1. Update Product Details
        const productPayload = {
          inventoryId: f.inventoryId, // SKU
          name: f.name,
          price: Number(f.price),
          priceAfterDiscount: Number(f.priceAfterDiscount || f.price),
          category: f.categoryId ? Number(f.categoryId) : null,
          subcategory: f.subCategoryId ? Number(f.subCategoryId) : null,
          purchaseCap: Number(f.purchaseCap || 1),
          discountQuantity: Number(f.discountQuantity || 0),
          barcodes: f.barcodes,
          showOnline: !!f.showOnline
        };

        // 2. Update Inventory/Stock Details (independent part)
        const inventoryPayload = {
          productId: f.inventoryId, // SKU
          stockQuantity: Number(f.initialQuantity || 0),
          stockThreshold: Number(f.threshold || 0),
          stockPrice: Number(f.initialPrice || 0),
          invoiceNumber: f.invoiceNumber || "",
          supplierId: f.supplierId || null,
        };

        // 3. Update Tax Info (independent part)
        let taxPayload = null;
        if (f.ItemCode || f.taxRate || f.ItemDescription || f.unitMeasure) {
          taxPayload = {
            productId: f.inventoryId, // SKU
            ItemCode: f.ItemCode || "",
            taxRate: Number(f.taxRate || 0),
            ItemDescription: f.ItemDescription || "",
            unitMeasure: f.unitMeasure || "",
          };
        }

        // Perform independent updates
        const updates = [];
        // Use Product ID for product update
        updates.push(API.products.update(productId, productPayload).then(() => {
          showToastMessage("Product details updated successfully", "success");
        }));

        // Use Inventory ID (SKU) for inventory update
        updates.push(API.inventories.update(f.inventoryId, inventoryPayload).then(() => {
          showToastMessage("Inventory/Stock updated successfully", "success");
          // Sync to IDB
          indexedDb.putInventories([{ ...inventoryPayload, inventoryId: f.inventoryId }]);
        }));

        if (taxPayload) {
          // Use Inventory ID (SKU) for tax update
          updates.push(API.goodsInfo.update(f.inventoryId, taxPayload).then(() => {
            showToastMessage("Tax info updated successfully", "success");
          }).catch(err => {
            console.error("Tax info update failed:", err);
            return API.goodsInfo.create(taxPayload).then(() => {
              showToastMessage("Tax info created successfully", "success");
            });
          }));
        }

        await Promise.all(updates);

        // Sync product to IDB
        indexedDb.putProducts([{ ...productPayload, id: productId }]);

        showToastMessage("Complete product updated successfully", "success");

        setShowAddCompleteProductModal(false);
        resetForms();
        fetchProducts(currentProductPage, true);
        fetchStocks(currentInventoryPage, true);
      } catch (error) {
        console.error("Update failed", error);
        showToastMessage("Failed to update product: " + (error?.response?.data?.message || error?.message || "Error"), "danger");
      } finally {
        setIsSubmitting(false);
        setIsLoading(false);
      }
      return;
    }

    // ADD MODE - Complete workflow: Inventory -> Product -> Tax
    let inventoryCreated = false;
    let inventoryIdentifier = null;
    let productCreated = false;
    let productId = null;

    try {
      const f = completeProductForm;

      // 1. Create Inventory
      const invPayload = {
        productId: f.inventoryId,
        stockQuantity: Number(f.initialQuantity || 0),
        stockPrice: Number(f.initialPrice || 0),
        stockThreshold: Number(f.threshold || 0),
        supplierId: f.supplierId,
        invoiceNumber: f.invoiceNumber,
      };

      const invResp = await API.inventories.create(invPayload);
      inventoryCreated = true;
      inventoryIdentifier = invResp?.id || invResp?.productId || f.inventoryId;
      // Sync IDB
      indexedDb.putInventories([{ ...invPayload, inventoryId: inventoryIdentifier }]);
      showToastMessage("Inventory created successfully", "success");

      // 2. Create Product
      const prodPayload = {
        SupplierId: f.supplierId,
        InvoiceNumber: f.invoiceNumber,
        inventoryId: f.inventoryId,
        purchaseCap: f.purchaseCap ? Number(f.purchaseCap) : undefined,
        category: f.categoryId,
        subcategory: f.subCategoryId,
        name: f.name,
        price: Number(f.price),
        barcodes: f.barcodes,
        showOnline: !!f.showOnline,
        discountQuantity: f.discountQuantity,
        priceAfterDiscount: f.priceAfterDiscount ? Number(f.priceAfterDiscount) : undefined,
      };

      const prodResp = await API.products.create(prodPayload);
      productCreated = true;
      productId = prodResp?.id || prodResp?.productId;
      // Sync IDB
      if (productId) {
        indexedDb.putProducts([{ ...prodPayload, id: productId }]);
      }
      showToastMessage("Product created successfully", "success");

      // 3. Create Tax (if filled)
      if (f.ItemCode && f.ItemDescription && f.unitMeasure && f.taxRate) {
        const taxPayload = {
          itemCode: f.ItemCode,
          itemDescription: f.ItemDescription,
          unitMeasure: f.unitMeasure,
          taxRate: Number(f.taxRate),
        };

        if (API.goodsInfo?.create) {
          await API.goodsInfo.create(taxPayload);
          showToastMessage("Tax data added successfully", "success");
        }
      }

      showToastMessage("Complete product added successfully!", "success");
      setShowAddCompleteProductModal(false);
      resetForms();
      fetchProducts(lastProductPage || currentProductPage, true);
      fetchStocks(lastInventoryPage || currentInventoryPage, true);

    } catch (error) {
      console.error("Error in complete product creation:", error);
      const backendMsg = error?.response?.data?.message || error?.message || JSON.stringify(error);

      if (productCreated && inventoryCreated) {
        showToastMessage(`Tax data creation failed: ${backendMsg}. Product and inventory were created successfully.`, "warning");
      } else if (productCreated && !inventoryCreated) {
        showToastMessage(`Product creation succeeded but inventory failed: ${backendMsg}`, "warning");
      } else if (inventoryCreated && !productCreated) {
        showToastMessage(`Product creation failed after inventory was created: ${backendMsg}. Attempting to rollback inventory...`, "warning");
        try {
          if (typeof API.inventories?.remove === "function") {
            await API.inventories.remove(inventoryIdentifier);
            showToastMessage("Rolled back created inventory successfully", "success");
          }
        } catch (rmErr) {
          console.error("Rollback failed:", rmErr);
          showToastMessage("Failed to rollback created inventory. Please remove it manually.", "danger");
        }
      } else {
        showToastMessage("Failed to create product/inventory: " + backendMsg, "danger");
      }
    } finally {
      setIsSubmitting(false);
      setIsLoading(false);
    }
  };

  const handleUpdateProductIndependent = async () => {
    try {
      setIsLoading(true);
      const f = completeProductForm;
      const productId = editProductData.Id || f.id;
      if (!productId) {
        throw new Error("Product ID not found");
      }
      const productPayload = {
        inventoryId: f.inventoryId,
        name: f.name,
        price: Number(f.price),
        priceAfterDiscount: Number(f.priceAfterDiscount || f.price),
        category: f.categoryId ? Number(f.categoryId) : null,
        subcategory: f.subCategoryId ? Number(f.subCategoryId) : null,
        purchaseCap: Number(f.purchaseCap || 1),
        discountQuantity: Number(f.discountQuantity || 0),
        barcodes: f.barcodes,
        showOnline: !!f.showOnline
      };
      await API.products.update(productId, productPayload);
      // Sync IDB
      indexedDb.putProducts([{ ...productPayload, id: productId }]);
      showToastMessage("Product details updated successfully", "success");
      fetchProducts(currentProductPage, true);
    } catch (error) {
      showToastMessage("Failed to update product: " + (error?.message || "error"), "danger");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateInventoryIndependent = async () => {
    try {
      setIsLoading(true);
      const f = completeProductForm;
      const inventoryPayload = {
        productId: f.inventoryId,
        stockQuantity: Number(f.initialQuantity || 0),
        stockThreshold: Number(f.threshold || 0),
        stockPrice: Number(f.initialPrice || 0),
        invoiceNumber: f.invoiceNumber || "",
        supplierId: f.supplierId || null,
      };
      await API.inventories.update(f.inventoryId, inventoryPayload);
      // Sync IDB
      indexedDb.putInventories([{ ...inventoryPayload, inventoryId: f.inventoryId }]);
      showToastMessage("Inventory updated successfully", "success");
      fetchStocks(currentInventoryPage, true);
    } catch (error) {
      showToastMessage("Failed to update inventory: " + (error?.message || "error"), "danger");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTaxIndependent = async () => {
    try {
      setIsLoading(true);
      const f = completeProductForm;
      if (!f.ItemCode || !f.taxRate || !f.ItemDescription || !f.unitMeasure) {
        showToastMessage("Please fill all tax fields before updating", "warning");
        return;
      }
      const taxPayload = {
        productId: f.inventoryId,
        ItemCode: f.ItemCode || "",
        taxRate: Number(f.taxRate || 0),
        ItemDescription: f.ItemDescription || "",
        unitMeasure: f.unitMeasure || "",
      };
      try {
        await API.goodsInfo.update(f.inventoryId, taxPayload);
        showToastMessage("Tax info updated successfully", "success");
      } catch (taxErr) {
        await API.goodsInfo.create(taxPayload);
        showToastMessage("Tax info created successfully", "success");
      }
    } catch (error) {
      showToastMessage("Failed to update tax info: " + (error?.message || "error"), "danger");
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <>
      <style type="text/css">{`
        .custom-modal { margin-right: 250px; }
        .small-offset-modal { margin-right: 50px; }
        .nav-link.active { color: orange !important; border-bottom: 2px solid orange; }
        .restock-search-results { max-height: 180px; overflow:auto; border: 1px solid #e9ecef; border-radius:6px; background: #fff; }
        .restock-search-item { padding:6px 8px; cursor:pointer; border-bottom:1px solid #f1f1f1; }
        .restock-search-item:last-child { border-bottom: none; }
      `}</style>

      {/* Top Navigation Bar */}
      <Navbar bg="light" expand="lg" className="shadow-sm mb-4">
        <Container>
          <Navbar.Toggle />
          <Navbar.Collapse>
            <Nav className="justify-content-center" style={{ width: "100%" }}>
              <Nav.Link active={activeView === "stocks"} onClick={() => { setActiveView("stocks"); fetchStocks(currentInventoryPage); }}>Stocks</Nav.Link>
              <Nav.Link active={activeView === "products"} onClick={() => { setActiveView("products"); fetchProducts(currentProductPage); }}>Products</Nav.Link>
              <Nav.Link active={activeView === "suppliers"} onClick={() => { fetchSuppliers(); }}>Suppliers</Nav.Link>
              <Nav.Link active={activeView === "invoice"} onClick={() => { fetchInvoices(); fetchInvoicesPaged(currentInvoicePage); }}>Invoices</Nav.Link>
              <Nav.Link active={activeView === "overview"} onClick={() => { setActiveView("overview"); fetchProducts(currentProductPage); fetchStocks(currentInventoryPage); }}>Overview</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container className="mb-4">
        <div className="d-flex justify-content-between align-items-center">
          <h2>Stock Management</h2>
          {activeView === "overview" && <h4 className="text-muted">Overview (All Data)</h4>}
          {activeView === "stocks" && <h4 className="text-muted">Stocks</h4>}
          {activeView === "products" && <h4 className="text-muted">Products</h4>}
          {activeView === "suppliers" && <h4 className="text-muted">Suppliers</h4>}
          {activeView === "invoice" && <h4 className="text-muted">Invoices</h4>}
        </div>
      </Container>

      {/* STOCKS VIEW */}
      {activeView === "stocks" && (
        <Container>
          {/* SEARCH BAR */}
          <div className="mb-3">
            <Form.Control
              type="text"
              placeholder="Search stocks by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <Button onClick={() => setShowRestockModal(true)}>Add Restock Data</Button>
            <Button onClick={() => fetchSuppliers()}>View Suppliers</Button>
            <Button onClick={() => setShowSupplierModal(true)}>Add Supplier</Button>
            <Button onClick={() => fetchInvoices()}>View Invoices</Button>
            <Button onClick={() => setShowInvoiceModal(true)}>Add Invoice</Button>
            <Button onClick={() => setShowStockExcelModal(true)}>Upload Stock Excel</Button>
          </div>

          <div className="d-flex align-items-center gap-2 mb-2">
            <Pagination className="m-0">
              <Pagination.Prev onClick={() => handleInventoryPageChange(currentInventoryPage - 1)} disabled={currentInventoryPage === 1} />
              <Pagination.Item active> page {currentInventoryPage}</Pagination.Item>
              <Pagination.Next onClick={() => handleInventoryPageChange(currentInventoryPage + 1)} disabled={!hasMoreInventories} />
            </Pagination>

            <InputGroup style={{ width: 220 }} size="sm" className="ms-auto">
              <Form.Control placeholder="Jump to page #" value={inventoryJumpPage} onChange={(e) => setInventoryJumpPage(e.target.value)} />
              <Button variant="outline-secondary" onClick={handleInventoryJumpToPage}>Go</Button>
            </InputGroup>
          </div>

          <Table striped bordered hover className="mt-2">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Quantity</th>
                <th>Threshold</th>
                <th>Purchase Price</th>
                <th>Product Name</th>
                <th>Updated At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inventories.length === 0 ? (
                <tr><td colSpan="7" className="text-center">No data available</td></tr>
              ) : (
                inventories.map((inv, index) => (
                  <tr key={index}>
                    <td>{inv.productId ?? inv.inventoryId}</td>
                    <td>{inv.stockQuantity}</td>
                    <td>{inv.stockThreshold}</td>
                    <td>{inv.stockPrice}</td>
                    <td>{inv.raw?.name || inv.productName || ""}</td>
                    <td>{inv.updatedAt ? new Date(inv.updatedAt).toLocaleString() : ""}</td>
                    <td>
                      <Button variant="outline-primary" size="sm" onClick={() => handleEditStock(inv)}>Edit</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Container>
      )}

      {/* PRODUCTS VIEW */}
      {activeView === "products" && (
        <Container>
          {/* SEARCH BAR */}
          <div className="mb-3">
            <Form.Control
              type="text"
              placeholder="Search products by name, ID or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <Button onClick={() => setShowAddCompleteProductModal(true)}>Add Complete Product</Button>
            <Button onClick={() => setShowImageUploadModal(true)}>Upload Product Image</Button>
            <Button onClick={() => setShowProductsExcelModal(true)}>Upload Products Excel</Button>
          </div>

          <div className="d-flex align-items-center gap-2 mb-2">
            <Pagination className="m-0">
              <Pagination.Prev onClick={() => handleProductPageChange(currentProductPage - 1)} disabled={currentProductPage === 1} />
              <Pagination.Item active> page {currentProductPage}</Pagination.Item>
              <Pagination.Next onClick={() => handleProductPageChange(currentProductPage + 1)} disabled={!hasMoreProducts} />
            </Pagination>

            <InputGroup style={{ width: 220 }} size="sm" className="ms-auto">
              <Form.Control placeholder="Jump to page #" value={productJumpPage} onChange={(e) => setProductJumpPage(e.target.value)} />
              <Button variant="outline-secondary" onClick={handleProductJumpToPage}>Go</Button>
            </InputGroup>
          </div>

          <Table striped bordered hover className="mt-2">
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Category</th>
                <th>Subcategory</th>
                <th>Show Online</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan="6" className="text-center">No data available</td></tr>
              ) : (
                products.map((prod, index) => (
                  <tr key={index}>
                    <td>{prod.name}</td>
                    <td>{prod.price}</td>
                    <td>{(categories.find(c => String(c.id) === String(prod.category))?.categoryName) || prod.category}</td>
                    <td>
                      {
                        (subCategories.find(s => String(s.id) === String(prod.subcategory))?.subcategoryName) || prod.subcategory
                      }
                    </td>
                    <td>{prod.showOnline ? "Yes" : "No"}</td>
                    <td>
                      <Button variant="outline-primary" size="sm" onClick={() => openUploadModal(prod.id)}>Upload Image</Button>{" "}
                      <Button variant="outline-primary" size="sm" onClick={() => handleEditCompleteProduct(prod)}>Edit</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Container>
      )}

      {/* SUPPLIERS VIEW */}
      {activeView === "suppliers" && (
        <Container>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <Button onClick={() => fetchSuppliers()}>View Suppliers</Button>
            <Button onClick={() => setShowSupplierModal(true)}>Add Supplier</Button>
          </div>

          <Table striped bordered hover className="mt-4">
            <thead>
              <tr>
                <th>Supplier ID</th>
                <th>Supplier Name</th>
                <th>KRA Pin</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && suppliers.length === 0 ? (
                <tr><td colSpan="4" className="text-center">Loading...</td></tr>
              ) : suppliers.length === 0 ? (
                <tr><td colSpan="4" className="text-center">No suppliers found</td></tr>
              ) : (
                suppliers.map((supplier) => (
                  <tr key={supplier.id ?? supplier._id}>
                    <td>{supplier.id ?? supplier._id}</td>
                    <td>{supplier.supplierName}</td>
                    <td>{supplier.kraPin}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button variant="outline-primary" size="sm" onClick={() => handleEditSupplier(supplier.id)}>Edit</Button>
                        <Button variant="outline-danger" size="sm" onClick={() => handleDeleteSupplier(supplier.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Container>
      )}

      {/* INVOICES VIEW */}
      {activeView === "invoice" && (
        <Container>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <Button onClick={() => setShowInvoiceModal(true)}>Add Invoice</Button>
          </div>

          <div className="d-flex align-items-center gap-2 mb-2">
            <Pagination className="m-0">
              <Pagination.Prev onClick={() => handleInvoicePageChange(currentInvoicePage - 1)} disabled={currentInvoicePage === 1} />
              <Pagination.Item active> page {currentInvoicePage}</Pagination.Item>
              <Pagination.Next onClick={() => handleInvoicePageChange(currentInvoicePage + 1)} disabled={!hasMoreInvoices} />
            </Pagination>

            <InputGroup style={{ width: 220 }} size="sm" className="ms-auto">
              <Form.Control placeholder="Jump to page #" value={invoiceJumpPage} onChange={(e) => setInvoiceJumpPage(e.target.value)} />
              <Button variant="outline-secondary" onClick={handleInvoiceJumpToPage}>Go</Button>
            </InputGroup>
          </div>

          <Table striped bordered hover className="mt-2">
            <thead>
              <tr>
                <th>Invoice ID</th>
                <th>Supplier</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && invoices.length === 0 ? (
                <tr><td colSpan="4" className="text-center">Loading...</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan="4" className="text-center">No invoices found</td></tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.invoiceId ?? invoice.id ?? invoice._id}>
                    <td>{invoice.invoiceId ?? invoice.id ?? invoice._id}</td>
                    <td>{invoice.supplierName ?? invoice.supplierId}</td>
                    <td>{invoice.totalAmount}</td>
                    <td>
                      <Button variant="outline-primary" size="sm" disabled>Edit</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Container>
      )}

      {/* OVERVIEW (Display Everything) VIEW */}
      {activeView === "overview" && (
        <Container>
          <div className="d-flex align-items-center gap-2 mb-2">
            <Pagination className="m-0">
              <Pagination.Prev onClick={() => handleProductPageChange(currentProductPage - 1)} disabled={currentProductPage === 1} />
              <Pagination.Item active> page {currentProductPage} (via Products)</Pagination.Item>
              <Pagination.Next onClick={() => handleProductPageChange(currentProductPage + 1)} disabled={!hasMoreProducts} />
            </Pagination>
          </div>

          <Table striped bordered hover responsive className="mt-2">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock Qty</th>
                <th>Threshold</th>
                <th>Supplier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && products.length === 0 ? (
                <tr><td colSpan="8" className="text-center">Loading...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan="8" className="text-center">No data available</td></tr>
              ) : (
                products.map((prod, index) => {
                  // Find related inventory
                  const inv = inventories.find(i => String(i.productId || i.inventoryId) === String(prod.inventoryId || prod.id));
                  // Find category name
                  const catName = categories.find(c => String(c.id) === String(prod.category))?.categoryName || prod.category;
                  // Supplier (triangulate from inventory or mapped if available)
                  // If we don't have supplierId on product, try inventory
                  const supplierId = inv?.supplierId;
                  const supplierName = supplierId ? (suppliers.find(s => String(s.id) === String(supplierId))?.supplierName || supplierId) : "-";

                  return (
                    <tr key={index}>
                      <td>
                        <strong>{prod.name}</strong>
                      </td>
                      <td>{prod.inventoryId ?? prod.id}</td>
                      <td>{catName}</td>
                      <td>{prod.price}</td>
                      <td>
                        {inv ? (
                          <span className={inv.stockQuantity <= inv.stockThreshold ? "text-danger fw-bold" : ""}>
                            {inv.stockQuantity}
                          </span>
                        ) : (
                          <span className="text-muted">?</span>
                        )}
                      </td>
                      <td>{inv?.stockThreshold ?? "-"}</td>
                      <td>{supplierName}</td>
                      <td>
                        {prod.showOnline ? <span className="text-success">Online</span> : <span className="text-secondary">Offline</span>}
                      </td>
                      <td>
                        <Button variant="outline-primary" size="sm" onClick={() => handleEditCompleteProduct(prod)}>Edit</Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Container>
      )}
      {/* ============ MODAL 1: ADD / EDIT COMPLETE PRODUCT (Inventory + Product + Tax) ============ */}
      <Modal
        show={showAddCompleteProductModal}
        onHide={() => {
          if (!isLoading) {
            setShowAddCompleteProductModal(false);
            resetForms();
          }
        }}
        size="xl"
        dialogClassName="modal-dialog-centered"
      >
        <Form onSubmit={(e) => { e.preventDefault(); handleAddCompleteProduct(); }} noValidate>
          <Modal.Header closeButton>
            <Modal.Title>{isEditingCompleteProduct ? "Edit Complete Product" : "Add Complete Product"} (Inventory + Product + Tax)</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ maxHeight: "75vh", overflowY: "auto" }}>
            {isSubmitting && Object.keys(formErrors).length > 0 && (
              <Alert variant="danger">
                <strong>Please fix the following errors:</strong>
                <ul className="mb-0 mt-2">
                  {Object.entries(formErrors).map(([key, msg]) => (
                    <li key={key}>{msg}</li>
                  ))}
                </ul>
              </Alert>
            )}


            {/* Inventory Details */}
            <div className="mb-4 p-3 border rounded bg-light">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">Inventory Details</h5>
                {isEditingCompleteProduct && (
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={handleUpdateInventoryIndependent}
                    disabled={isLoading}
                  >
                    Update Inventory Only
                  </Button>
                )}
              </div>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Inventory Product ID (SKU) <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="text"
                      value={completeProductForm.inventoryId}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, inventoryId: e.target.value });
                        setFormErrors(prev => ({ ...prev, inventoryId: undefined }));
                      }}
                      isInvalid={!!formErrors.inventoryId}
                      required
                      placeholder="Enter SKU"
                      disabled={isEditingCompleteProduct} // Disabled in edit mode
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.inventoryId}</Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Initial Quantity <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      value={completeProductForm.initialQuantity}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, initialQuantity: e.target.value });
                        setFormErrors(prev => ({ ...prev, initialQuantity: undefined }));
                      }}
                      min="0"
                      isInvalid={!!formErrors.initialQuantity}
                      required
                      placeholder="0"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.initialQuantity}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Initial Purchase Price <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      value={completeProductForm.initialPrice}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, initialPrice: e.target.value });
                        setFormErrors(prev => ({ ...prev, initialPrice: undefined }));
                      }}
                      min="0"
                      step="0.01"
                      isInvalid={!!formErrors.initialPrice}
                      required
                      placeholder="0.00"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.initialPrice}</Form.Control.Feedback>
                    <Form.Text className="text-muted">Editable purchase price per unit.</Form.Text>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Stock Threshold <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      value={completeProductForm.threshold}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, threshold: e.target.value });
                        setFormErrors(prev => ({ ...prev, threshold: undefined }));
                      }}
                      min="0"
                      isInvalid={!!formErrors.threshold}
                      required
                      placeholder="0"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.threshold}</Form.Control.Feedback>
                    <Form.Text className="text-muted">Alert when stock falls below this number.</Form.Text>
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Supplier <span className="text-danger">*</span></Form.Label>
                    <Form.Select
                      value={completeProductForm.supplierId ?? ""}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, supplierId: e.target.value, invoiceNumber: "" });
                        setFormErrors(prev => ({ ...prev, supplierId: undefined }));
                      }}
                      isInvalid={!!formErrors.supplierId}
                      required
                    >
                      <option value="">Select a supplier</option>
                      {suppliers.map((s) => (
                        <option key={s.id ?? s.supplierId ?? s._id} value={s.id ?? s.supplierId ?? s._id}>
                          {s.supplierName ?? s.name}
                        </option>
                      ))}
                    </Form.Select>
                    <Form.Control.Feedback type="invalid">{formErrors.supplierId}</Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Invoice <span className="text-danger">*</span></Form.Label>
                    <Form.Select
                      value={completeProductForm.invoiceNumber ?? ""}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, invoiceNumber: e.target.value });
                        setFormErrors(prev => ({ ...prev, invoiceNumber: undefined }));
                      }}
                      isInvalid={!!formErrors.invoiceNumber}
                      required
                      disabled={!completeProductForm.supplierId}
                    >
                      <option value="">Select an invoice</option>
                      {invoices
                        .filter(inv => !completeProductForm.supplierId || String(inv.supplierId) === String(completeProductForm.supplierId))
                        .map((inv) => (
                          <option key={inv.invoiceId ?? inv.id ?? inv._id} value={inv.invoiceId ?? inv.id ?? inv._id}>
                            {(inv.invoiceId ?? inv.id ?? inv._id)}{inv.totalAmount ? ` — ${inv.totalAmount}` : ""}
                          </option>
                        ))
                      }
                    </Form.Select>
                    <Form.Control.Feedback type="invalid">{formErrors.invoiceNumber}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>
            </div>

            {/* Product Details */}
            <div className="mb-4 p-3 border rounded bg-light">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">Product Details</h5>
                {isEditingCompleteProduct && (
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={handleUpdateProductIndependent}
                    disabled={isLoading}
                  >
                    Update Product Only
                  </Button>
                )}
              </div>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Product Name <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="text"
                      value={completeProductForm.name}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, name: e.target.value });
                        setFormErrors(prev => ({ ...prev, name: undefined }));
                      }}
                      isInvalid={!!formErrors.name}
                      required
                      placeholder="Enter product name"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.name}</Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Barcode <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="text"
                      value={completeProductForm.barcodes}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, barcodes: e.target.value });
                        setFormErrors(prev => ({ ...prev, barcodes: undefined }));
                      }}
                      isInvalid={!!formErrors.barcodes}
                      required
                      placeholder="Enter barcode"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.barcodes}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Selling Price <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      value={completeProductForm.price}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, price: e.target.value });
                        setFormErrors(prev => ({ ...prev, price: undefined }));
                      }}
                      required
                      min="0"
                      step="0.01"
                      isInvalid={!!formErrors.price}
                      placeholder="0.00"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.price}</Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Price After Discount <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      value={completeProductForm.priceAfterDiscount}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, priceAfterDiscount: e.target.value });
                        setFormErrors(prev => ({ ...prev, priceAfterDiscount: undefined }));
                      }}
                      min="0"
                      step="0.01"
                      isInvalid={!!formErrors.priceAfterDiscount}
                      required
                      placeholder="0.00"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.priceAfterDiscount}</Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Discount Quantity <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="text"
                      value={completeProductForm.discountQuantity}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, discountQuantity: e.target.value });
                        setFormErrors(prev => ({ ...prev, discountQuantity: undefined }));
                      }}
                      isInvalid={!!formErrors.discountQuantity}
                      required
                      placeholder="e.g., 10"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.discountQuantity}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Category <span className="text-danger">*</span></Form.Label>
                    <div className="d-flex">
                      <Form.Select
                        value={completeProductForm.categoryId ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompleteProductForm({ ...completeProductForm, categoryId: val === "" ? null : Number(val), subCategoryId: null });
                          setFormErrors(prev => ({ ...prev, categoryId: undefined }));
                        }}
                        isInvalid={!!formErrors.categoryId}
                        required
                      >
                        <option value="">Select a category</option>
                        {categories.map((cat) => (
                          <option key={cat.id ?? cat.categoryId ?? cat._id} value={cat.id ?? cat.categoryId ?? cat._id}>
                            {(cat.id ?? cat.categoryId ?? cat._id) + " - " + (cat.categoryName ?? cat.name ?? "")}
                          </option>
                        ))}
                      </Form.Select>
                      <Button
                        type="button"
                        variant="outline-secondary"
                        className="ms-2"
                        onClick={() => setShowCategoryModal(true)}
                        disabled={isLoading}
                      >
                        +
                      </Button>
                    </div>
                    <Form.Control.Feedback type="invalid">{formErrors.categoryId}</Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Subcategory <span className="text-danger">*</span></Form.Label>
                    <div className="d-flex">
                      <Form.Select
                        value={completeProductForm.subCategoryId ?? ""}
                        onChange={(e) => {
                          setCompleteProductForm({ ...completeProductForm, subCategoryId: e.target.value === "" ? null : Number(e.target.value) });
                          setFormErrors(prev => ({ ...prev, subCategoryId: undefined }));
                        }}
                        disabled={completeProductForm.categoryId === null}
                        isInvalid={!!formErrors.subCategoryId}
                        required
                      >
                        <option value="">Select a subcategory</option>
                        {typeof renderSubCategoryOptionsFor === "function" ? renderSubCategoryOptionsFor(completeProductForm.categoryId) : subCategories
                          .filter(sc => sc.categoryId === completeProductForm.categoryId || String(sc.categoryId) === String(completeProductForm.categoryId))
                          .map(sc => (
                            <option key={sc.id ?? sc.subcategoryId ?? sc._id} value={sc.id ?? sc.subcategoryId ?? sc._id}>
                              {sc.subcategoryName ?? sc.name}
                            </option>
                          ))
                        }
                      </Form.Select>
                      <Button
                        type="button"
                        variant="outline-secondary"
                        className="ms-2"
                        onClick={() => setShowSubCategoryModal(true)}
                        disabled={isLoading || completeProductForm.categoryId === null}
                      >
                        +
                      </Button>
                    </div>
                    <Form.Control.Feedback type="invalid">{formErrors.subCategoryId}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Purchase Cap <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      value={completeProductForm.purchaseCap}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, purchaseCap: e.target.value });
                        setFormErrors(prev => ({ ...prev, purchaseCap: undefined }));
                      }}
                      min="1"
                      isInvalid={!!formErrors.purchaseCap}
                      required
                      placeholder="1"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.purchaseCap}</Form.Control.Feedback>
                    <Form.Text className="text-muted">Max quantity per purchase.</Form.Text>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group className="mb-3">
                    <div className="d-flex align-items-center justify-content-between p-3 bg-white rounded-3 border">
                      <div>
                        <Form.Label className="mb-1">Show Online</Form.Label>
                        <div className="text-muted small">Display product on online store</div>
                      </div>
                      <Form.Check
                        type="switch"
                        id="showOnlineSwitchComplete"
                        checked={!!completeProductForm.showOnline}
                        onChange={(e) => setCompleteProductForm({ ...completeProductForm, showOnline: e.target.checked })}
                      />
                    </div>
                  </Form.Group>
                </Col>
              </Row>
            </div>

            {/* Tax Information (Optional) */}
            <div className="mb-4 p-3 border rounded bg-light">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">Tax Information (Optional)</h5>
                {isEditingCompleteProduct && (
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={handleUpdateTaxIndependent}
                    disabled={isLoading}
                  >
                    Update Tax Only
                  </Button>
                )}
              </div>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>KRA Tax Code</Form.Label>
                    <Form.Control
                      type="text"
                      value={completeProductForm.ItemCode}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, ItemCode: e.target.value });
                        setFormErrors(prev => ({ ...prev, ItemCode: undefined }));
                      }}
                      isInvalid={!!formErrors.ItemCode}
                      placeholder="Enter KRA tax code"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.ItemCode}</Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Tax Rate (%)</Form.Label>
                    <Form.Control
                      type="number"
                      value={completeProductForm.taxRate}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, taxRate: e.target.value });
                        setFormErrors(prev => ({ ...prev, taxRate: undefined }));
                      }}
                      min="0"
                      step="0.01"
                      isInvalid={!!formErrors.taxRate}
                      placeholder="0.00"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.taxRate}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Item Description</Form.Label>
                    <Form.Control
                      type="text"
                      value={completeProductForm.ItemDescription}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, ItemDescription: e.target.value });
                        setFormErrors(prev => ({ ...prev, ItemDescription: undefined }));
                      }}
                      isInvalid={!!formErrors.ItemDescription}
                      placeholder="Tax item description"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.ItemDescription}</Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Unit of Measure</Form.Label>
                    <Form.Control
                      type="text"
                      value={completeProductForm.unitMeasure}
                      onChange={(e) => {
                        setCompleteProductForm({ ...completeProductForm, unitMeasure: e.target.value });
                        setFormErrors(prev => ({ ...prev, unitMeasure: undefined }));
                      }}
                      isInvalid={!!formErrors.unitMeasure}
                      placeholder="e.g., pcs, kg, liters"
                    />
                    <Form.Control.Feedback type="invalid">{formErrors.unitMeasure}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!isLoading) {
                  setShowAddCompleteProductModal(false);
                  resetForms();
                }
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading || isSubmitting}
            >
              {isLoading ? (isEditingCompleteProduct ? "Updating..." : "Adding...") : (isEditingCompleteProduct ? "Update Product" : "Add Complete Product")}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ============ MODAL 2: ADD CATEGORY ============ */}
      <Modal show={showCategoryModal} onHide={() => !isLoading && setShowCategoryModal(false)} centered>
        <Form onSubmit={(e) => { e.preventDefault(); handleAddCategory(e); }}>
          <Modal.Header closeButton>
            <Modal.Title>Add Category</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Category Name <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                required
                placeholder="Enter category name"
                disabled={isLoading}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => !isLoading && setShowCategoryModal(false)} disabled={isLoading}>
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? "Adding..." : "Add Category"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ============ MODAL 3: ADD SUBCATEGORY ============ */}
      <Modal show={showSubCategoryModal} onHide={() => !isLoading && setShowSubCategoryModal(false)} centered>
        <Form onSubmit={(e) => { e.preventDefault(); handleAddSubCategory(e); }}>
          <Modal.Header closeButton>
            <Modal.Title>Add Subcategory</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Category <span className="text-danger">*</span></Form.Label>
              <Form.Select
                value={subCategoryData.categoryId ?? ""}
                onChange={(e) => setSubCategoryData({ ...subCategoryData, categoryId: e.target.value === "" ? null : Number(e.target.value) })}
                required
                disabled={isLoading}
              >
                <option value="">Select a category</option>
                {categories.map((cat) => (
                  <option key={cat.id ?? cat.categoryId ?? cat._id} value={cat.id ?? cat.categoryId ?? cat._id}>
                    {cat.categoryName ?? cat.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Subcategory Name <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                value={subCategoryData.subcategoryName}
                onChange={(e) => setSubCategoryData({ ...subCategoryData, subcategoryName: e.target.value })}
                required
                placeholder="Enter subcategory name"
                disabled={isLoading}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => !isLoading && setShowSubCategoryModal(false)} disabled={isLoading}>
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? "Adding..." : "Add Subcategory"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ============ MODAL 4: ADD INVOICE ============ */}
      <Modal show={showInvoiceModal} onHide={() => !isLoading && setShowInvoiceModal(false)} centered>
        <Form onSubmit={async (e) => {
          e.preventDefault();
          try {
            setIsLoading(true);
            if (!invoiceForm.invoiceId || !invoiceForm.supplierId) {
              showToastMessage("Invoice number and supplier are required", "danger");
              return;
            }
            if (typeof API.invoices?.create === "function") {
              await API.invoices.create({
                invoiceId: invoiceForm.invoiceId,
                totalAmount: invoiceForm.totalAmount,
                supplierId: invoiceForm.supplierId,
              });
              showToastMessage("Invoice added successfully", "success");
              setShowInvoiceModal(false);
              setInvoiceForm({ invoiceId: "", totalAmount: "", supplierId: "" });
              if (typeof fetchInvoices === "function") fetchInvoices();
            } else {
              showToastMessage("Invoices API not available", "danger");
            }
          } catch (err) {
            showToastMessage("Failed to add invoice: " + (err?.message || "error"), "danger");
          } finally {
            setIsLoading(false);
          }
        }}>
          <Modal.Header closeButton>
            <Modal.Title>Add Invoice</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Invoice Number <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                value={invoiceForm.invoiceId}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceId: e.target.value })}
                placeholder="Enter invoice number"
                required
                disabled={isLoading}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Total Amount</Form.Label>
              <Form.Control
                type="number"
                value={invoiceForm.totalAmount}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, totalAmount: e.target.value })}
                placeholder="0.00"
                step="0.01"
                disabled={isLoading}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Supplier <span className="text-danger">*</span></Form.Label>
              <div className="d-flex align-items-center">
                <Form.Select
                  value={invoiceForm.supplierId}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, supplierId: e.target.value })}
                  required
                  disabled={isLoading}
                >
                  <option value="">Select a supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id ?? s.supplierId ?? s._id} value={s.id ?? s.supplierId ?? s._id}>{s.supplierName ?? s.name}</option>
                  ))}
                </Form.Select>
                <Button variant="primary" className="ms-2" onClick={() => setShowSupplierModal(true)} disabled={isLoading}>+</Button>
              </div>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => !isLoading && setShowInvoiceModal(false)} disabled={isLoading}>
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? "Adding…" : "Add Invoice"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ============ MODAL 5: ADD SUPPLIER ============ */}
      <Modal show={showSupplierModal} onHide={() => !isLoading && setShowSupplierModal(false)} centered>
        <Form onSubmit={(e) => { e.preventDefault(); handleAddSupplier(); }}>
          <Modal.Header closeButton>
            <Modal.Title>Add Supplier</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Supplier Name <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                value={supplierData.supplierName}
                onChange={(e) => setSupplierData({ ...supplierData, supplierName: e.target.value })}
                required
                placeholder="Enter supplier name"
                disabled={isLoading}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>KRA Pin <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                value={supplierData.kraPin}
                onChange={(e) => setSupplierData({ ...supplierData, kraPin: e.target.value })}
                required
                placeholder="Enter KRA PIN"
                disabled={isLoading}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => !isLoading && setShowSupplierModal(false)} disabled={isLoading}>
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? "Adding..." : "Add Supplier"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ============ MODAL 6: EDIT SUPPLIER ============ */}
      <Modal show={showEditSupplierModal} onHide={() => !isLoading && setShowEditSupplierModal(false)} centered>
        <Form onSubmit={(e) => { e.preventDefault(); handleUpdateSupplier(); }}>
          <Modal.Header closeButton>
            <Modal.Title>Edit Supplier</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Supplier Name <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                value={editingSupplier.supplierName ?? ""}
                onChange={(e) => setEditingSupplier({ ...editingSupplier, supplierName: e.target.value })}
                disabled={isLoading}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>KRA PIN</Form.Label>
              <Form.Control
                type="text"
                value={editingSupplier.kraPin ?? ""}
                onChange={(e) => setEditingSupplier({ ...editingSupplier, kraPin: e.target.value })}
                disabled={isLoading}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => !isLoading && setShowEditSupplierModal(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ============ MODAL 7: EDIT STOCK ============ */}
      <Modal show={showEditStockModal} onHide={() => !isLoading && setShowEditStockModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Edit Stock</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editStockData ? (
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Product SKU <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="text"
                  value={editStockData.productId ?? editStockData.inventoryId ?? editStockData.id ?? ""}
                  onChange={(e) => setEditStockData({ ...editStockData, productId: e.target.value })}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Quantity <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number"
                  value={editStockData.stockQuantity ?? editStockData.quantity ?? ""}
                  onChange={(e) => setEditStockData({ ...editStockData, stockQuantity: e.target.value })}
                  required
                  min="0"
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Threshold <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number"
                  value={editStockData.stockThreshold ?? editStockData.threshold ?? ""}
                  onChange={(e) => setEditStockData({ ...editStockData, stockThreshold: e.target.value })}
                  required
                  min="0"
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Purchase Price (Editable) <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number"
                  value={editStockData.stockPrice ?? editStockData.purchasePrice ?? ""}
                  onChange={(e) => setEditStockData({ ...editStockData, stockPrice: e.target.value })}
                  required
                  min="0"
                  step="0.01"
                />
                <Form.Text className="text-muted">You can edit the purchase price.</Form.Text>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Invoice Number <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="text"
                  value={editStockData.invoiceNumber ?? ""}
                  onChange={(e) => setEditStockData({ ...editStockData, invoiceNumber: e.target.value })}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Supplier <span className="text-danger">*</span></Form.Label>
                <Form.Select
                  value={editStockData.supplierId ?? editStockData.supplier ?? ""}
                  onChange={(e) => setEditStockData({ ...editStockData, supplierId: e.target.value })}
                  required
                >
                  <option value="">Select a supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id ?? supplier.supplierId ?? supplier._id} value={supplier.id ?? supplier.supplierId ?? supplier._id}>
                      {supplier.supplierName ?? supplier.name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Form>
          ) : (
            <div>No stock selected.</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => !isLoading && setShowEditStockModal(false)} disabled={isLoading}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!editStockData) return;
              try {
                setIsLoading(true);
                const payload = {
                  productId: editStockData.productId ?? editStockData.id ?? editStockData.inventoryId,
                  stockQuantity: Number(editStockData.stockQuantity ?? editStockData.quantity ?? 0),
                  stockThreshold: Number(editStockData.stockThreshold ?? editStockData.threshold ?? 0),
                  stockPrice: Number(editStockData.stockPrice ?? editStockData.purchasePrice ?? 0),
                  invoiceNumber: editStockData.invoiceNumber ?? "",
                  supplierId: editStockData.supplierId ?? editStockData.supplier ?? null,
                };
                // Use productId (SKU) as the URL parameter for the inventory endpoint
                const id = editStockData.productId ?? editStockData.id ?? editStockData.inventoryId;
                if (typeof API.inventories?.update === "function") {
                  await API.inventories.update(id, payload);
                  // Sync IDB
                  indexedDb.putInventories([{ ...payload, inventoryId: id }]);
                  showToastMessage("Stock updated successfully", "success");
                  setShowEditStockModal(false);
                  fetchStocks(lastInventoryPage || currentInventoryPage, true);
                  setCurrentInventoryPage(lastInventoryPage || currentInventoryPage);
                } else {
                  showToastMessage("Inventory update API not available", "danger");
                }
              } catch (err) {
                console.error(err);
                showToastMessage("Failed to update stock: " + (err?.message || "error"), "danger");
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
          >
            {isLoading ? "Updating..." : "Update Stock"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============ MODAL 8: EDIT PRODUCT ============ */}
      <Modal show={showEditModal} onHide={() => !isLoading && handleEditClose()} size="lg" centered>
        <Form onSubmit={(e) => { e.preventDefault(); handleEditProduct(); }}>
          <Modal.Header closeButton>
            <Modal.Title>Edit Product</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto" }}>
            <div className="mb-4">
              <h6 className="text-muted mb-3">Basic Information</h6>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Inventory Product ID</Form.Label>
                    <Form.Control
                      type="text"
                      value={editProductData.inventoryId ?? ""}
                      readOnly
                      className="bg-light"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Product Name <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="text"
                      value={editProductData.name ?? ""}
                      onChange={(e) => setEditProductData({ ...editProductData, name: e.target.value })}
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>
            </div>

            <div className="mb-4">
              <h6 className="text-muted mb-3">Pricing</h6>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Price <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      value={editProductData.price ?? ""}
                      onChange={(e) => setEditProductData({ ...editProductData, price: e.target.value })}
                      required
                      min="0"
                      step="0.01"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Price After Discount</Form.Label>
                    <Form.Control
                      type="number"
                      value={editProductData.priceAfterDiscount ?? ""}
                      onChange={(e) => setEditProductData({ ...editProductData, priceAfterDiscount: e.target.value })}
                      min="0"
                      step="0.01"
                    />
                  </Form.Group>
                </Col>
              </Row>
            </div>

            <div className="mb-4">
              <h6 className="text-muted mb-3">Product Details</h6>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Barcode</Form.Label>
                    <Form.Control
                      type="text"
                      value={editProductData.barcodes ?? ""}
                      onChange={(e) => setEditProductData({ ...editProductData, barcodes: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Discount Quantity</Form.Label>
                    <Form.Control
                      type="text"
                      value={editProductData.discountQuantity ?? ""}
                      onChange={(e) => setEditProductData({ ...editProductData, discountQuantity: e.target.value })}
                    />
                  </Form.Group>
                </Col>
              </Row>
            </div>

            <div className="mb-4">
              <h6 className="text-muted mb-3">Category</h6>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Category <span className="text-danger">*</span></Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Select
                        value={editProductData.categoryId ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditProductData({ ...editProductData, categoryId: val === "" ? null : Number(val), subCategoryId: null });
                        }}
                        required
                      >
                        <option value="">Select a category</option>
                        {categories.map((cat) => (
                          <option key={cat.id ?? cat.categoryId ?? cat._id} value={cat.id ?? cat.categoryId ?? cat._id}>
                            {(cat.id ?? cat.categoryId ?? cat._id) + " - " + (cat.categoryName ?? cat.name ?? "")}
                          </option>
                        ))}
                      </Form.Select>
                      <Button
                        type="button"
                        variant="outline-secondary"
                        onClick={() => setShowCategoryModal(true)}
                        disabled={isLoading}
                      >
                        +
                      </Button>
                    </div>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Subcategory <span className="text-danger">*</span></Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Select
                        value={editProductData.subCategoryId ?? ""}
                        onChange={(e) => setEditProductData({ ...editProductData, subCategoryId: e.target.value === "" ? null : Number(e.target.value) })}
                        required
                        disabled={editProductData.categoryId === null}
                      >
                        <option value="">Select a subcategory</option>
                        {typeof renderSubCategoryOptionsFor === "function" ? renderSubCategoryOptionsFor(editProductData.categoryId) : subCategories
                          .filter(sc => sc.categoryId === editProductData.categoryId || String(sc.categoryId) === String(editProductData.categoryId))
                          .map(sc => (
                            <option key={sc.id ?? sc.subcategoryId ?? sc._id} value={sc.id ?? sc.subcategoryId ?? sc._id}>
                              {sc.subcategoryName ?? sc.name}
                            </option>
                          ))
                        }
                      </Form.Select>
                      <Button
                        type="button"
                        variant="outline-secondary"
                        onClick={() => setShowSubCategoryModal(true)}
                        disabled={isLoading || editProductData.categoryId === null}
                      >
                        +
                      </Button>
                    </div>
                  </Form.Group>
                </Col>
              </Row>
            </div>

            <div className="mb-4">
              <h6 className="text-muted mb-3">Settings</h6>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Purchase Cap</Form.Label>
                    <Form.Control
                      type="number"
                      value={editProductData.purchaseCap ?? ""}
                      onChange={(e) => setEditProductData({ ...editProductData, purchaseCap: e.target.value })}
                      min="1"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <div className="d-flex align-items-center justify-content-between p-3 bg-light rounded">
                      <div>
                        <Form.Label className="mb-1">Show Online</Form.Label>
                        <div className="text-muted small">Display on online store</div>
                      </div>
                      <Form.Check
                        type="switch"
                        id="showOnlineSwitchEdit"
                        checked={!!editProductData.showOnline}
                        onChange={(e) => setEditProductData({ ...editProductData, showOnline: e.target.checked })}
                      />
                    </div>
                  </Form.Group>
                </Col>
              </Row>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => !isLoading && handleEditClose()} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ============ MODAL 9: IMAGE UPLOAD ============ */}
      <Modal show={showImageUploadModal} onHide={() => !isLoading && setShowImageUploadModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Upload Product Image</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Select Image</Form.Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/webp"
                onChange={handleImageChange}
                style={{ display: "none" }}
                disabled={isLoading}
              />
              <div
                className="border border-2 rounded p-4 text-center"
                style={{ cursor: "pointer", backgroundColor: "#f8f9ff" }}
                onClick={() => { if (fileInputRef.current) fileInputRef.current.click(); }}
              >
                {imageData.image ? (
                  <div>
                    <strong>{imageData.image.name}</strong>
                    <div className="text-muted small mt-2">
                      Size: {(imageData.image.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                ) : (
                  <div>
                    <div><strong>Click to select an image</strong></div>
                    <div className="text-muted small mt-2">Choose from your computer</div>
                  </div>
                )}
              </div>
              <Form.Text className="text-muted">Supported formats: JPEG, PNG, WebP. Maximum size: 5MB</Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                id="isPrimaryCheckbox"
                label="Set as primary product image"
                checked={!!imageData.isPrimary}
                onChange={(e) => setImageData({ ...imageData, isPrimary: e.target.checked })}
                disabled={isLoading}
              />
              <Form.Text className="text-muted d-block mt-1">Primary images are displayed as the main product image.</Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => !isLoading && setShowImageUploadModal(false)} disabled={isLoading}>
            Close
          </Button>
          <Button variant="primary" onClick={handleUploadImage} disabled={isLoading || !imageData.image}>
            {isLoading ? "Uploading..." : "Upload Image"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============ MODAL 10: PRODUCTS EXCEL UPLOAD ============ */}
      <Modal show={showProductsExcelModal} onHide={() => !isLoading && setShowProductsExcelModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Upload Products Excel</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Select Excel File</Form.Label>
              <Form.Control
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setProductsExcelFile(e.target.files?.[0] ?? null)}
                disabled={isLoading}
              />
              <Form.Text className="text-muted">Upload a spreadsheet containing product data in the expected format.</Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => !isLoading && setShowProductsExcelModal(false)} disabled={isLoading}>
            Close
          </Button>
          <Button variant="primary" onClick={handleUploadProductsExcel} disabled={isLoading || !productsExcelFile}>
            {isLoading ? "Uploading..." : "Upload"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============ MODAL 11: STOCK EXCEL UPLOAD ============ */}
      <Modal show={showStockExcelModal} onHide={() => !isLoading && setShowStockExcelModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Upload Stock Excel</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Select Excel File</Form.Label>
              <Form.Control
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setStockExcelFile(e.target.files?.[0] ?? null)}
                disabled={isLoading}
              />
              <Form.Text className="text-muted">Upload a spreadsheet containing inventory/stock updates in the expected format.</Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => !isLoading && setShowStockExcelModal(false)} disabled={isLoading}>
            Close
          </Button>
          <Button variant="primary" onClick={handleUploadStockExcel} disabled={isLoading || !stockExcelFile}>
            {isLoading ? "Uploading..." : "Upload"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============ MODAL 12: RESTOCK ============ */}
      <Modal show={showRestockModal} onHide={() => !isLoading && setShowRestockModal(false)} size="lg" centered>
        <Form onSubmit={(e) => { e.preventDefault(); handleAddRestock(); }}>
          <Modal.Header closeButton>
            <Modal.Title>Add Restock Data</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto" }}>
            <Row className="mb-3">
              <Col>
                <Form.Label>Supplier <span className="text-danger">*</span></Form.Label>
                <Form.Select
                  value={restockMeta.supplierId}
                  onChange={(e) => setRestockMeta({ ...restockMeta, supplierId: e.target.value })}
                  disabled={isLoading}
                  required
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id ?? supplier.supplierId ?? supplier._id} value={supplier.id ?? supplier.supplierId ?? supplier._id}>
                      {supplier.supplierName ?? supplier.name}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col>
                <Form.Label>Invoice <span className="text-danger">*</span></Form.Label>
                <Form.Select
                  value={restockMeta.invoiceNumber}
                  onChange={(e) => setRestockMeta({ ...restockMeta, invoiceNumber: e.target.value })}
                  disabled={isLoading}
                  required
                >
                  <option value="">Select the invoice</option>
                  {invoices.map((inv) => (
                    <option key={inv.invoiceId ?? inv.id ?? inv._id} value={inv.invoiceId ?? inv.id ?? inv._id}>
                      {inv.invoiceId ?? inv.id ?? inv._id}{inv.totalAmount ? ` — ${inv.totalAmount}` : ""}
                    </option>
                  ))}
                </Form.Select>
              </Col>
            </Row>

            {restockEntries.map((entry, index) => (
              <div
                key={index}
                style={{
                  marginBottom: 24,
                  padding: 16,
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  backgroundColor: "#f9f9f9"
                }}
              >
                <Row className="mb-2">
                  <Col md={6}>
                    <Form.Label>Find Product (Search)</Form.Label>
                    <Form.Control
                      placeholder="Search SKU or name..."
                      value={entry.productIdName ?? ""}
                      onChange={(e) => {
                        updateRestockEntry(index, "productIdName", e.target.value);
                        setRestockSearch(e.target.value);
                      }}
                      disabled={isLoading}
                    />
                    <div className="restock-search-results mt-2" style={{ maxHeight: 200, overflowY: "auto" }}>
                      {restockSearchResults.length === 0 ? (
                        <div style={{ padding: 8 }} className="text-muted small">
                          No results on cached pages. Try 'Load more' or change page.
                        </div>
                      ) : restockSearchResults.map((inv) => (
                        <div
                          key={inv.id ?? inv.productId ?? inv.inventoryId ?? inv._id}
                          className="restock-search-item p-2"
                          style={{ cursor: "pointer", borderBottom: "1px solid #eee" }}
                          onClick={() => {
                            pickRestockProduct(index, inv.id ?? inv.productId ?? inv.inventoryId ?? inv._id);
                            updateRestockEntry(index, "productIdName", (inv.productName ?? inv.name ?? inv.productName ?? inv.id ?? inv.productId ?? inv.inventoryId));
                            updateRestockEntry(index, "productId", inv.productId ?? inv.inventoryId ?? inv.id ?? inv._id);
                          }}
                          title={`Pick ${inv.productId ?? inv.inventoryId ?? inv.id}`}
                        >
                          <div style={{ fontSize: 13 }}>{inv.productName ?? inv.name ?? "(no name)"}</div>
                          <div style={{ fontSize: 11, color: "#6c757d" }}>{inv.productId ?? inv.inventoryId ?? inv.id}</div>
                        </div>
                      ))}
                    </div>

                    <div className="d-flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (restockProductPage > 1) {
                            const prev = restockProductPage - 1;
                            setRestockProductPage(prev);
                            fetchRestockProducts(prev, false);
                          } else {
                            showToastMessage("Already at first cached page", "info");
                          }
                        }}
                        disabled={isLoading}
                      >
                        Prev Page
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => {
                          if (hasMoreRestockProducts) {
                            loadMoreRestockProducts();
                          } else {
                            showToastMessage("No more pages to load", "info");
                          }
                        }}
                        disabled={isLoading}
                      >
                        Load More
                      </Button>

                      <div className="ms-auto text-muted small align-self-center">
                        Cached pages: {Math.max(1, Math.ceil((allRestockProducts || []).length / pageSize))}
                      </div>
                    </div>

                    <Form.Text className="text-muted">Click an item to populate product field below.</Form.Text>
                  </Col>

                  <Col md={3}>
                    <Form.Label>Quantity <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      value={entry.restockQuantity}
                      onChange={(e) => updateRestockEntry(index, "restockQuantity", e.target.value)}
                      min="0"
                      disabled={isLoading}
                    />
                  </Col>

                  <Col md={3}>
                    <Form.Label>Purchase Price <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      value={entry.purchasePrice}
                      onChange={(e) => updateRestockEntry(index, "purchasePrice", e.target.value)}
                      min="0"
                      step="0.01"
                      disabled={isLoading}
                    />
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Selected Product ID</Form.Label>
                      <Form.Control
                        type="text"
                        value={entry.productId ?? ""}
                        onChange={(e) => updateRestockEntry(index, "productId", e.target.value)}
                        disabled={isLoading}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <div className="d-flex justify-content-end mt-2">
                  <Button variant="outline-danger" size="sm" onClick={() => removeRestockEntry(index)} disabled={isLoading}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}

            <div className="d-flex justify-content-end">
              <Button variant="secondary" onClick={addRestockEntry} disabled={isLoading}>+ Add Another Product</Button>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => !isLoading && setShowRestockModal(false)} disabled={isLoading}>
              Close
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? "Saving…" : "Save Restock"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
};

export default StockManagement;